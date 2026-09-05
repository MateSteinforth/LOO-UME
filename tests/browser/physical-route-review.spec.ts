import { readFileSync } from "node:fs";
import { createSocket } from "node:dgram";
import { expect, test } from "@playwright/test";
import { optimizeAutomaticWiring } from "../../src/sculpture/AutomaticWiringOptimizer.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly.ts";
import { createSimulatorSetupConfig } from "../../web/src/Esp32Setup.ts";
import { createHardwareMappingContract } from "../../web/src/HardwareMapping.ts";
import { createPhysicalRouteReviewSession } from "../../web/src/PhysicalRouteReview.ts";
import { createProvisionalWiringPreview } from "../../web/src/WiringPreview.ts";

const SOURCE = "./physical-route-review.json";
const panelProfile = JSON.parse(
  readFileSync("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
);
const threePanelInput = JSON.parse(
  readFileSync(
    "sculptures/structural-three-panel-trail/sculpture.json",
    "utf8",
  ),
);
for (const [index, panel] of (
  threePanelInput.panels as Array<{
    pose: { position: number[]; orientation: Record<string, number[]> };
  }>
).entries()) {
  panel.pose.position = [index * 80, 0, 0];
  panel.pose.orientation = {
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
    normal: [0, 0, 1],
  };
}
const sourceDefinition = optimizeAutomaticWiring(
  threePanelInput,
  panelProfile,
).definition;
for (const [index, output] of sourceDefinition.wiring.outputs.entries()) {
  output.gpio = [21, 22, 25, 26][index]!;
}
const project = createPanelAssemblyProject(
  sourceDefinition,
  SOURCE,
  panelProfile,
);
const mapping = createPanelAssemblyMapping(project);
const wiring = createProvisionalWiringPreview(
  mapping,
  project.sculpture,
  project.panelProfile,
);
const contract = createHardwareMappingContract(
  mapping,
  wiring,
  project.panelProfile,
);
const session = createPhysicalRouteReviewSession(project.sculpture, contract);
const config = createSimulatorSetupConfig(
  JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
  contract.outputs.map((output) => ({
    startIndex: output.startIndex,
    pixelCount: output.pixelCount,
    gpio: output.gpio!,
  })),
  contract.wledColorOrder.wledValue,
  64,
) as Record<string, unknown>;
(config as { id?: unknown }).id = { mdns: "loo-ume", name: "LOO/UME" };

async function routeThreePanelProject(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/physical-route-review.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sourceDefinition),
    });
  });
}

function artDmx(
  universe: number,
  data: Uint8Array,
  sequence: number,
): Uint8Array {
  const packet = new Uint8Array(18 + data.byteLength);
  packet.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]);
  packet.set([0x00, 0x50, 0x00, 0x0e, sequence, 0x00], 8);
  packet[14] = universe & 0xff;
  packet[15] = universe >> 8;
  packet[16] = data.byteLength >> 8;
  packet[17] = data.byteLength & 0xff;
  packet.set(data, 18);
  return packet;
}

async function sendArtNetPackets(packets: Uint8Array[]): Promise<void> {
  const socket = createSocket("udp4");
  try {
    for (const packet of packets) {
      await new Promise<void>((resolve, reject) => {
        socket.send(packet, 6454, "127.0.0.1", (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    socket.close();
  }
}

function ddpFrame(data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(10 + data.byteLength);
  packet.set([0x41, 1, 0x0b, 0x01]);
  new DataView(packet.buffer).setUint16(8, data.byteLength, false);
  packet.set(data, 10);
  return packet;
}

async function sendDdpFrame(data: Uint8Array): Promise<void> {
  const socket = createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.send(ddpFrame(data), 4048, "127.0.0.1", (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    socket.close();
  }
}

test("runs the physical review workflow without hardware in demo mode", async ({
  page,
}) => {
  let hardwareFrames = 0;
  await routeThreePanelProject(page);
  await page.route("**/api/esp32-frame?**", async (route) => {
    hardwareFrames += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.goto("/?sculptureJson=.%2Fphysical-route-review.json");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  const reviewButton = page.locator("#open-physical-route-review");
  await expect(reviewButton).toBeEnabled();
  await expect(page.locator("#open-physical-route-review-demo")).toHaveCount(0);
  await reviewButton.click();
  const dialog = page.locator("#physical-route-review-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-mode", "demo");
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-pixels",
    "63",
  );
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-step")).toContainText(
    "2 / 3",
  );
  await page.locator("#physical-route-review-confirm").click();
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  await expect(
    page.locator("#physical-route-review-summary-note"),
  ).toContainText("Demo complete");
  await expect(page.locator("#physical-route-review-apply")).toBeHidden();
  expect(hardwareFrames).toBe(0);
  await page.locator("#physical-route-review-cancel").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#viewer")).not.toHaveAttribute(
    "data-physical-route-review-pixels",
    /.+/,
  );
});

test("mirrors external frames and reviews a physical panel", async ({
  page,
}) => {
  const frames: Buffer[] = [];
  const applyEvents: string[] = [];
  let savedPreset: Record<string, unknown> | undefined;
  let servedLedmap: unknown;
  let recordApplyEvents = false;
  let failReviewedLedmapReadback = true;
  let reviewedLedmapUploaded = false;
  let resolveLedmap!: () => void;
  const ledmapReady = new Promise<void>((resolve) => {
    resolveLedmap = resolve;
  });
  await page.addInitScript(() => {
    localStorage.setItem("loo-ume:esp32-reconnect-enabled", "1");
  });
  await page.route("**/api/esp32-frame?**", async (route) => {
    frames.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
    if (recordApplyEvents) applyEvents.push("live-frame");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/api/esp32-device?**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const address = url.searchParams.get("address");
    const path = url.searchParams.get("path");
    const info = {
      arch: "esp32",
      ip: "192.168.68.53",
      mac: "aa:bb:cc:dd:ee:ff",
      leds: { count: contract.mapping.entries.length, bootps: 1 },
    };
    if (path === "/json/info") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(address === "loo-ume.local" ? info : info),
      });
      return;
    }
    if (path === "/json/cfg") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config),
      });
      return;
    }
    if (path === "/edit?func=edit&path=/ledmap.json") {
      await ledmapReady;
      if (recordApplyEvents) applyEvents.push("ledmap-read");
      if (
        recordApplyEvents &&
        reviewedLedmapUploaded &&
        failReviewedLedmapReadback
      ) {
        failReviewedLedmapReadback = false;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"map":[0]}',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: `${JSON.stringify(servedLedmap)}\n`,
      });
      return;
    }
    if (path === "/json/eff") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '["Rainbow"]',
      });
      return;
    }
    if (path === "/json/pal") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '["Rainbow"]',
      });
      return;
    }
    if (path === "/presets.json") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "1": savedPreset }),
      });
      return;
    }
    if (path === "/json/state" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (body.psave === 1) savedPreset = body;
      if (recordApplyEvents && body.ledmap === 0)
        applyEvents.push("activate-map-0");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    if (path === "/json/state") {
      if (recordApplyEvents) applyEvents.push("active-map-read");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ledmap":0}',
      });
      return;
    }
    if (path === "/upload" && request.method() === "POST") {
      const match = request
        .postDataBuffer()
        ?.toString("utf8")
        .match(/\{"map":\[[0-9,]+\]\}/);
      if (!match) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: "{}",
        });
        return;
      }
      servedLedmap = JSON.parse(match[0]);
      reviewedLedmapUploaded = true;
      if (recordApplyEvents) applyEvents.push("ledmap-upload");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{}",
    });
  });

  await routeThreePanelProject(page);
  await page.goto("/?sculptureJson=.%2Fphysical-route-review.json");
  const browserContract = await page.evaluate(async () => {
    const modulePath = "/src/ProjectLoader.ts";
    const module = await import(/* @vite-ignore */ modulePath);
    const loaded = await module.loadSculptureContract(
      "./physical-route-review.json",
    );
    return {
      fingerprint: loaded.contract.fingerprint,
      ledmap: loaded.contract.ledmap,
    };
  });
  servedLedmap = browserContract.ledmap;
  resolveLedmap();
  expect(browserContract.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Reconnected at 192.168.68.53",
    { timeout: 20_000 },
  );
  await expect(page.locator("#madmapper-preview")).toHaveCount(0);
  await expect(page.locator("#madmapper-preview-status")).toContainText(
    "Waiting for Art-Net",
  );

  await sendArtNetPackets([artDmx(1, new Uint8Array(510).fill(63), 21)]);
  await page.waitForTimeout(250);
  await expect(page.locator("#sculpture-mirror-status")).toHaveText(
    "Sculpture mirror is ready",
  );

  const physicalRgb = Uint8Array.from(
    { length: contract.mapping.entries.length * 3 },
    (_, index) => (index * 29 + 17) % 256,
  );
  await sendArtNetPackets([
    artDmx(1, physicalRgb.slice(0, 510), 22),
    artDmx(2, physicalRgb.slice(510), 22),
  ]);
  const logicalRgb = new Uint8Array(physicalRgb.length);
  for (const entry of contract.mapping.entries) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = physicalRgb[entry.physicalIndex * 3 + channel]!;
      logicalRgb[entry.logicalIndex * 3 + channel] = Math.floor(
        (value / 255) ** 2.2 * 255 + 0.5,
      );
    }
  }
  await expect
    .poll(() => frames.some((frame) => frame.equals(logicalRgb)))
    .toBe(true);
  await expect(page.locator("#sculpture-mirror-status")).toContainText(
    "1 visible frame mirrored",
  );

  await expect(page.locator("#ddp-preview-status")).toContainText(
    "Waiting for DDP",
  );
  const ddpRgb = new Uint8Array(contract.mapping.entries.length * 3).fill(96);
  await sendDdpFrame(ddpRgb);
  const gammaDdpRgb = Buffer.from(
    ddpRgb.map((value) => Math.floor((value / 255) ** 2.2 * 255 + 0.5)),
  );
  await expect(page.locator("#ddp-preview-status")).toContainText("FPS DDP");
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-external-frame-source",
    "ddp",
  );
  await expect
    .poll(() => frames.some((frame) => frame.equals(gammaDdpRgb)))
    .toBe(true);

  const reviewButton = page.locator("#open-physical-route-review");
  await expect(reviewButton).toBeEnabled();
  await expect(
    page.locator("#physical-route-review-availability"),
  ).toContainText("Ready to review", { timeout: 20_000 });
  await reviewButton.click();

  const dialog = page.locator("#physical-route-review-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#madmapper-preview-status")).toHaveText(
    "Art-Net input paused for physical wiring review",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-pixels",
    "63",
  );
  await expect(page.locator("#app")).toHaveClass(/app--physical-route-review/);
  await expect(page.locator(".control-panel")).toHaveCSS(
    "pointer-events",
    "none",
  );
  expect(
    await page
      .locator(".control-panel")
      .evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-panel",
    session.slots[0]!.panelId,
  );
  await expect
    .poll(() => frames.at(-1)?.byteLength)
    .toBe(contract.mapping.entries.length * 3);
  const firstDiagnostic = frames.at(-1)!;
  expect([...firstDiagnostic.subarray(0, 3)]).toEqual([255, 0, 0]);
  expect([...firstDiagnostic.subarray(63 * 3, 64 * 3)]).toEqual([0, 0, 0]);
  expect(
    Array.from({ length: contract.mapping.entries.length }, (_, index) =>
      firstDiagnostic
        .subarray(index * 3, index * 3 + 3)
        .some((channel) => channel !== 0),
    ).filter(Boolean),
  ).toHaveLength(63);

  // Keep the same diagnostic frame active while the operator inspects the panel.
  const heldFrameCount = frames.length;
  await expect
    .poll(() => frames.length)
    .toBeGreaterThanOrEqual(heldFrameCount + 12);
  expect(
    frames
      .slice(heldFrameCount)
      .every((frame) => frame.equals(firstDiagnostic)),
  ).toBe(true);

  const replacementPanelId = session.slots[1]!.panelId;
  await page
    .locator(`.panel-label[data-panel-id="${replacementPanelId}"]`)
    .click();
  await expect(page.locator("#physical-route-review-step")).toContainText(
    "1 / 3",
  );
  await expect(page.locator("#physical-route-review-current")).toContainText(
    `Assigned ${replacementPanelId}`,
  );
  await page.locator("#physical-route-review-rotate-right").click();
  await expect(page.locator("#physical-route-review-current")).toContainText(
    "Address orientation 270°",
  );
  await expect
    .poll(() => Array.from(frames.at(-1)?.subarray(56 * 3, 57 * 3) ?? []))
    .toEqual([255, 0, 0]);
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-turns",
    "0",
  );
  await page.locator("#physical-route-review-rotate-left").click();
  await expect.poll(() => frames.at(-1)?.equals(firstDiagnostic)).toBe(true);
  await page.locator("#physical-route-review-rotate-right").click();
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-step")).toContainText(
    "2 / 3",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-panel",
    session.slots[0]!.panelId,
  );

  await page.locator("#physical-route-review-cancel").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#app")).not.toHaveClass(
    /app--physical-route-review/,
  );
  expect(
    await page
      .locator(".control-panel")
      .evaluate((element) => (element as HTMLElement).inert),
  ).toBe(false);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Physical wiring review cancelled. No project data changed.",
  );
  await expect(page.locator("#viewer")).not.toHaveAttribute(
    "data-physical-route-review-pixels",
    /.+/,
  );
  await expect(page.locator("#madmapper-preview-status")).toContainText(
    "Waiting for Art-Net",
  );

  await expect(
    page.locator("#physical-route-review-availability"),
  ).toContainText("Ready to review", { timeout: 20_000 });
  await reviewButton.click();
  await expect(dialog).toHaveAttribute("data-mode", "device");
  await page
    .locator(`.panel-label[data-panel-id="${replacementPanelId}"]`)
    .click();
  await page.locator("#physical-route-review-confirm").click();
  for (let index = 1; index < session.slots.length; index += 1) {
    await page.locator("#physical-route-review-confirm").click();
  }
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  await expect(
    page.locator("#physical-route-review-change-list"),
  ).toContainText(replacementPanelId);
  recordApplyEvents = true;
  applyEvents.length = 0;
  const framesBeforeApply = frames.length;
  await page.locator("#physical-route-review-apply").click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("#physical-route-review-apply")).toHaveText(
    "Retry exact ESP32 verification",
  );
  await expect(page.locator("#physical-route-review-cancel")).toBeDisabled();
  await expect(
    page.locator("#physical-route-review-summary-back"),
  ).toBeDisabled();
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  const firstMapRead = applyEvents.indexOf("ledmap-read");
  expect(firstMapRead).toBeGreaterThanOrEqual(0);
  expect(applyEvents.slice(firstMapRead)).not.toContain("live-frame");
  expect(
    frames
      .slice(framesBeforeApply)
      .every((frame) => frame.every((value) => value === 0)),
  ).toBe(true);
  // A pending blackout may finish before mapping access starts.
  applyEvents.splice(0, firstMapRead);
  await page.locator("#physical-route-review-apply").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Physical panel order and address orientation were saved",
  );
  await expect(page.locator("#viewer")).not.toHaveAttribute(
    "data-physical-route-review-pixels",
    /.+/,
  );
  await expect(page.locator("#madmapper-preview-status")).toContainText(
    "Waiting for Art-Net",
  );
  expect(applyEvents.slice(0, 5)).toEqual([
    "ledmap-read",
    "ledmap-upload",
    "activate-map-0",
    "active-map-read",
    "ledmap-read",
  ]);
  expect(applyEvents.slice(5, 9)).toEqual([
    "ledmap-read",
    "activate-map-0",
    "active-map-read",
    "ledmap-read",
  ]);
  await expect.poll(() => applyEvents.includes("live-frame")).toBe(true);
  expect(applyEvents.indexOf("live-frame")).toBeGreaterThan(8);
});
