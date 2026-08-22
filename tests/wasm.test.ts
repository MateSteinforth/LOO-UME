import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface TestModule {
  HEAPU32: Uint32Array;
  _wled_init(count: number): number;
  _wled_resize(count: number): number;
  _wled_reset(seed: number): void;
  _wled_set_effect(id: number): void;
  _wled_set_speed(value: number): void;
  _wled_set_intensity(value: number): void;
  _wled_set_palette(id: number): void;
  _wled_tick(timeMs: number): void;
  _wled_get_pixel_buffer(): number;
  _wled_get_led_count(): number;
  _wled_get_effect_count(): number;
  _wled_get_oob_write_count(): number;
}

async function loadModule(): Promise<TestModule> {
  const outputDir = path.resolve("web/public/wasm");
  const jsPath = path.join(outputDir, "wled-engine.js");
  const wasmPath = path.join(outputDir, "wled-engine.wasm");
  if (!existsSync(jsPath) || !existsSync(wasmPath)) {
    throw new Error(
      "The checked-in WLED simulator is missing. Restore web/public/wasm from main; rebuilds belong on generate/wled-simulator.",
    );
  }
  const url = pathToFileURL(jsPath).href;
  const imported = (await import(url)) as {
    default(options: { locateFile(pathName: string): string }): Promise<TestModule>;
  };
  return imported.default({
    locateFile: (pathName) => path.join(outputDir, pathName),
  });
}

function snapshot(module: TestModule): number[] {
  const start = module._wled_get_pixel_buffer() >>> 2;
  return Array.from(
    module.HEAPU32.subarray(start, start + module._wled_get_led_count()),
  );
}

describe("WLED WASM engine", () => {
  it("initializes, selects effects, and mutates the framebuffer", async () => {
    const module = await loadModule();
    expect(module._wled_init(2624)).toBe(1);
    expect(module._wled_get_effect_count()).toBeGreaterThanOrEqual(10);

    module._wled_set_effect(8);
    module._wled_set_speed(180);
    module._wled_set_intensity(160);
    module._wled_set_palette(6);
    module._wled_tick(0);
    const first = snapshot(module);
    module._wled_tick(1000);
    const second = snapshot(module);

    expect(first).toHaveLength(2624);
    expect(second).not.toEqual(first);
    expect(second.some((pixel) => pixel !== 0)).toBe(true);
    expect(module._wled_get_oob_write_count()).toBe(0);
  });

  it("is deterministic for equal initial state and supplied timestamps", async () => {
    const module = await loadModule();
    module._wled_init(256);
    module._wled_set_effect(8);
    module._wled_set_speed(137);
    module._wled_set_intensity(201);
    module._wled_set_palette(1);

    const run = (): number[] => {
      module._wled_reset(12345);
      for (const time of [0, 24, 48, 72, 96, 120]) module._wled_tick(time);
      return snapshot(module);
    };

    expect(run()).toEqual(run());
  });

  it("resizes without out-of-bounds writes", async () => {
    const module = await loadModule();
    for (const count of [64, 2700, 8192]) {
      expect(module._wled_resize(count)).toBe(1);
      module._wled_set_effect(9);
      module._wled_set_intensity(255);
      for (const time of [0, 250, 500, 750, 1000]) module._wled_tick(time);
      expect(snapshot(module)).toHaveLength(count);
      expect(module._wled_get_oob_write_count()).toBe(0);
    }
  });

  it("runs every registered effect deterministically at sculpture scale", async () => {
    const module = await loadModule();
    expect(module._wled_init(2700)).toBe(1);
    module._wled_set_speed(193);
    module._wled_set_intensity(211);
    module._wled_set_palette(6);

    const timestamps = [0, 24, 120, 500, 1000, 2500];
    const effectCount = module._wled_get_effect_count();
    expect(effectCount).toBe(30);

    for (let effectId = 0; effectId < effectCount; effectId += 1) {
      module._wled_set_effect(effectId);
      const run = (): number[] => {
        module._wled_reset(0x5eed1234);
        for (const time of timestamps) module._wled_tick(time);
        return snapshot(module);
      };

      const first = run();
      expect(run(), `effect ${effectId} should be deterministic`).toEqual(first);
      expect(
        first.some((pixel) => pixel !== 0),
        `effect ${effectId} should render at least one lit pixel`,
      ).toBe(true);
      expect(
        module._wled_get_oob_write_count(),
        `effect ${effectId} should stay inside the framebuffer`,
      ).toBe(0);
    }
  });

});
