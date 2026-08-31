import { readFileSync } from "node:fs";
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
const panelProfile = JSON.parse(readFileSync(
  "catalog/panels/ws2812b-8x8-66x65.json",
  "utf8",
));
const threePanelInput = JSON.parse(readFileSync(
  "sculptures/structural-three-panel-trail/sculpture.json",
  "utf8",
));
for (const [index, panel] of (threePanelInput.panels as Array<{
  pose: { position: number[]; orientation: Record<string, number[]> };
}>).entries()) {
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
const contract = createHardwareMappingContract(mapping, wiring, project.panelProfile);
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

async function routeThreePanelProject(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/physical-route-review.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sourceDefinition),
    });
  });
}

test("runs the physical review workflow without hardware in demo mode", async ({ page }) => {
  let hardwareFrames = 0;
  await routeThreePanelProject(page);
  await page.route("**/api/esp32-frame?**", async (route) => {
    hardwareFrames += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
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
    "data-physical-route-review-demo-pixels",
    "64",
  );
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-step")).toContainText("2 / 3");
  await page.locator("#physical-route-review-confirm").click();
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  await expect(page.locator("#physical-route-review-summary-note")).toContainText(
    "Demo complete",
  );
  await expect(page.locator("#physical-route-review-apply")).toBeHidden();
  expect(hardwareFrames).toBe(0);
  await page.locator("#physical-route-review-cancel").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#viewer")).not.toHaveAttribute(
    "data-physical-route-review-demo-pixels",
    /.+/,
  );
});

test("reviews a physical panel while keeping the viewport selectable", async ({ page }) => {
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
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) });
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
      await route.fulfill({ status: 200, contentType: "application/json", body: '["Rainbow"]' });
      return;
    }
    if (path === "/json/pal") {
      await route.fulfill({ status: 200, contentType: "application/json", body: '["Rainbow"]' });
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
      if (recordApplyEvents && body.ledmap === 0) applyEvents.push("activate-map-0");
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (path === "/json/state") {
      if (recordApplyEvents) applyEvents.push("active-map-read");
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ledmap":0}' });
      return;
    }
    if (path === "/upload" && request.method() === "POST") {
      const match = request.postDataBuffer()?.toString("utf8").match(/\{"map":\[[0-9,]+\]\}/);
      if (!match) {
        await route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
        return;
      }
      servedLedmap = JSON.parse(match[0]);
      reviewedLedmapUploaded = true;
      if (recordApplyEvents) applyEvents.push("ledmap-upload");
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await routeThreePanelProject(page);
  await page.goto("/?sculptureJson=.%2Fphysical-route-review.json");
  const browserContract = await page.evaluate(async () => {
    const modulePath = "/src/ProjectLoader.ts";
    const module = await import(/* @vite-ignore */ modulePath);
    const loaded = await module.loadSculptureContract(
      "./physical-route-review.json",
    );
    return { fingerprint: loaded.contract.fingerprint, ledmap: loaded.contract.ledmap };
  });
  servedLedmap = browserContract.ledmap;
  resolveLedmap();
  expect(browserContract.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Reconnected at 192.168.68.53",
    { timeout: 20_000 },
  );
  const reviewButton = page.locator("#open-physical-route-review");
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();

  const dialog = page.locator("#physical-route-review-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#app")).toHaveClass(/app--physical-route-review/);
  await expect(page.locator(".control-panel")).toHaveCSS("pointer-events", "none");
  expect(await page.locator(".control-panel").evaluate((element) =>
    (element as HTMLElement).inert
  )).toBe(true);
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-panel",
    session.slots[0]!.panelId,
  );
  await expect.poll(() => frames.at(-1)?.byteLength).toBe(
    contract.mapping.entries.length * 3,
  );
  const firstDiagnostic = frames.at(-1)!;
  expect([...firstDiagnostic.subarray(0, 3)]).toEqual([0, 255, 0]);
  expect([...firstDiagnostic.subarray(63 * 3, 64 * 3)]).toEqual([56, 0, 91]);
  expect(Array.from({ length: contract.mapping.entries.length }, (_, index) =>
    firstDiagnostic.subarray(index * 3, index * 3 + 3).some((channel) => channel !== 0)
  ).filter(Boolean)).toHaveLength(64);

  const replacementPanelId = session.slots[1]!.panelId;
  await page.locator(`.panel-label[data-panel-id="${replacementPanelId}"]`).click();
  await expect(page.locator("#physical-route-review-step")).toContainText("1 / 3");
  await expect(page.locator("#physical-route-review-current")).toContainText(
    `Assigned ${replacementPanelId}`,
  );
  await page.locator("#physical-route-review-rotate-right").click();
  await expect(page.locator("#physical-route-review-current")).toContainText(
    "Address orientation 90°",
  );
  await page.locator("#physical-route-review-confirm").click();
  await expect(page.locator("#physical-route-review-step")).toContainText("2 / 3");
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-physical-route-review-panel",
    session.slots[0]!.panelId,
  );

  await page.locator("#physical-route-review-cancel").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#app")).not.toHaveClass(/app--physical-route-review/);
  expect(await page.locator(".control-panel").evaluate((element) =>
    (element as HTMLElement).inert
  )).toBe(false);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Physical wiring review cancelled. No project data changed.",
  );

  await reviewButton.click();
  await expect(dialog).toBeVisible();
  await page.locator(`.panel-label[data-panel-id="${replacementPanelId}"]`).click();
  await page.locator("#physical-route-review-confirm").click();
  for (let index = 1; index < session.slots.length; index += 1) {
    await page.locator("#physical-route-review-confirm").click();
  }
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  await expect(page.locator("#physical-route-review-change-list")).toContainText(
    replacementPanelId,
  );
  recordApplyEvents = true;
  applyEvents.length = 0;
  await page.locator("#physical-route-review-apply").click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("#physical-route-review-apply")).toHaveText(
    "Retry exact ESP32 verification",
  );
  await expect(page.locator("#physical-route-review-cancel")).toBeDisabled();
  await expect(page.locator("#physical-route-review-summary-back")).toBeDisabled();
  await expect(page.locator("#physical-route-review-summary")).toBeVisible();
  expect(applyEvents).not.toContain("live-frame");
  await page.locator("#physical-route-review-apply").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Physical panel order and address orientation were saved",
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
