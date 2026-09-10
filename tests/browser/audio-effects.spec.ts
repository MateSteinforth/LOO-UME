import { readFileSync } from "node:fs";
import { createSocket } from "node:dgram";
import { createDdpPacket } from "../../scripts/esp32-device-handler.ts";
import { expect, test } from "@playwright/test";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../../web/src/WiringPreview.ts";
import { createSimulatorSetupConfig } from "../../web/src/Esp32Setup.ts";
import {
  compileEquatorMapping,
  equatorMappingSha256,
} from "../../src/effects/EquatorMapping.ts";

const definition = JSON.parse(
  readFileSync("sculptures/rhombicosidodecahedron/sculpture.json", "utf8"),
);
const profile = JSON.parse(
  readFileSync("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
);
const project = createPanelAssemblyProject(
  definition,
  "./sculptures/rhombicosidodecahedron/sculpture.json",
  profile,
);
const mapping = createPanelAssemblyMapping(project);
const contract = createHardwareMappingContract(
  mapping,
  createProvisionalWiringPreview(mapping, project.sculpture, profile),
  profile,
);
const config = createSimulatorSetupConfig(
  JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
  contract.outputs.map((output) => ({
    startIndex: output.startIndex,
    pixelCount: output.pixelCount,
    gpio: output.gpio!,
  })),
  contract.wledColorOrder.wledValue,
  64,
);
config.id = { mdns: "loo-ume", name: "LOO/UME" };

for (const audioSupported of [true, false]) {
  test(`microphone dropdown and streaming with AudioReactive ${audioSupported ? "present" : "absent"}`, async ({
    page,
  }) => {
    let frames = 0;
    let saved: Record<string, unknown> = {};
    const coordinateHash = await equatorMappingSha256(
      compileEquatorMapping(mapping.entries),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem("loo-ume:esp32-reconnect-enabled", "1"),
    );
    await page.route("**/api/esp32-frame?**", async (route) => {
      frames += 1;
      await route.fulfill({ json: {} });
    });
    await page.route("**/api/esp32-reconnect-project", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.route("**/api/esp32-device?**", async (route) => {
      const path = new URL(route.request().url()).searchParams.get("path");
      if (path === "/json/info")
        return route.fulfill({
          json: {
            arch: "esp32",
            ip: "192.168.68.56",
            mac: "aa:bb:cc:dd:ee:ff",
            leds: { count: mapping.entries.length, bootps: 1 },
            um: audioSupported ? [32] : [],
            equatorWave: {
              renderer: "equator-wave-v1",
              mappingSha256: coordinateHash,
              ledCount: mapping.entries.length,
            },
          },
        });
      if (path === "/json/cfg") return route.fulfill({ json: config });
      if (path === "/edit?func=edit&path=/ledmap.json")
        return route.fulfill({ json: contract.ledmap });
      if (path === "/json/eff")
        return route.fulfill({
          json: ["Rainbow", "Pixels", "Freqwave", "2D GEQ", "Equator Wave"],
        });
      if (path === "/json/fxdata")
        return route.fulfill({
          json: [
            "",
            "Fade,Count;!;!;1v;ix=64",
            "Speed,Sound;!;!;01f;sx=90,ix=120",
            "!;!;!;2f",
            "Speed,Sensitivity;Wave;;;",
          ],
        });
      if (path === "/json/pal") return route.fulfill({ json: ["Rainbow"] });
      if (path === "/presets.json")
        return route.fulfill({ json: { "1": saved } });
      if (path === "/json/state" && route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (body.psave === 1) saved = body;
        return route.fulfill({ json: { success: true } });
      }
      if (path === "/json/state")
        return route.fulfill({ json: { ...saved, ledmap: 0 } });
      throw new Error(`Unexpected device request: ${path}`);
    });
    await page.goto(
      "/?sculptureJson=./sculptures/rhombicosidodecahedron/sculpture.json",
    );
    await expect(page.locator("#pipeline-status")).toContainText(
      "Reconnected at",
    );
    await expect.poll(() => frames).toBeGreaterThan(2);
    const group = page.locator(
      '#effect optgroup[label="Audio reactive · ESP32 microphone"]',
    );
    if (!audioSupported) {
      await expect(group).toHaveCount(0);
      expect(errors).toEqual([]);
      return;
    }
    await expect(group.locator("option")).toHaveText(["Pixels", "Freqwave"]);
    await page.locator("#effect").selectOption("audio:1");
    const beforeSave = saved;
    await page.waitForTimeout(650);
    expect(saved).toEqual(beforeSave);
    await page.locator("#save-audio-to-esp32").click();
    await expect
      .poll(() => saved.seg)
      .toMatchObject({ fx: 1, si: 0, m12: 0, ix: 64 });
    expect(saved.AudioReactive).toEqual({ enabled: true });
    expect(saved.live).toBe(false);
    await expect(page.locator("#audio-effect-status")).toContainText(
      "3D view does not show",
    );
    const pausedFrames = frames;
    const socket = createSocket("udp4");
    try {
      const pixels = new Uint8Array(mapping.entries.length * 3).fill(48);
      for (let offset = 0; offset < pixels.length; offset += 1440) {
        const packet = createDdpPacket(
          pixels.slice(offset, offset + 1440),
          1,
          offset,
          offset + 1440 >= pixels.length,
        );
        await new Promise<void>((resolve, reject) =>
          socket.send(packet, 4048, "127.0.0.1", (error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
      await expect(page.locator("#viewer")).toHaveAttribute(
        "data-external-frame-source",
        "ddp",
      );
    } finally {
      socket.close();
    }
    await page.waitForTimeout(600);
    expect(frames).toBe(pausedFrames);
    await page.locator("#next-effect").click();
    await expect(page.locator("#effect")).toHaveValue("audio:2");
    await page.locator("#save-audio-to-esp32").click();
    await expect
      .poll(() => saved.seg)
      .toMatchObject({ fx: 2, sx: 90, ix: 120 });
    await page.locator("#intensity").fill("180");
    await page.locator("#save-audio-to-esp32").click();
    await expect.poll(() => saved.seg).toMatchObject({ fx: 2, ix: 180 });
    expect(frames).toBe(pausedFrames);
    await page.locator("#effect").selectOption("8");
    await expect.poll(() => saved.seg).toMatchObject({ fx: 0 });
    await expect.poll(() => frames).toBeGreaterThan(pausedFrames);
    await expect(page.locator("#audio-effect-status")).toContainText(
      "ESP32 audio effects use the controller microphone",
    );
    await page.locator("#effect").selectOption({ label: "Equator Wave" });
    await page.locator("#speed").fill("173");
    await page.locator("#intensity").fill("191");
    await page.waitForTimeout(650);
    expect(saved.seg).toMatchObject({ fx: 0 });
    const beforeEquatorSave = frames;
    await page.locator("#save-audio-to-esp32").click();
    await expect
      .poll(() => saved.seg)
      .toMatchObject({ fx: 4, sx: 173, ix: 191 });
    await expect(page.locator("#audio-save-status")).toContainText(
      "Saved the effect and settings",
    );
    expect(saved.AudioReactive).toEqual({ enabled: true });
    await page.waitForTimeout(600);
    expect(frames).toBe(beforeEquatorSave);
    expect(errors).toEqual([]);
  });
}
