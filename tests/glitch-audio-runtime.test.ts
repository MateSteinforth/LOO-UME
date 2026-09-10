import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import reference from "./fixtures/glitch-audio-reference.json" with { type: "json" };

interface GlitchModule {
  HEAPU32: Uint32Array;
  _wled_init(count: number): number;
  _wled_resize(count: number): number;
  _wled_get_pixel_buffer(): number;
  _equator_set_point(index: number, longitude: number, height: number): number;
  _glitch_reset(seed: number): void;
  _glitch_tick(
    effect: number,
    time: number,
    bass: number,
    mid: number,
    treble: number,
    speed: number,
    intensity: number,
    color: number,
  ): void;
}

async function loadModule(): Promise<GlitchModule> {
  const directory = path.resolve("web/public/wasm");
  const imported = (await import(
    pathToFileURL(path.join(directory, "wled-engine.js")).href
  )) as {
    default(options: {
      locateFile(name: string): string;
    }): Promise<GlitchModule>;
  };
  return imported.default({ locateFile: (name) => path.join(directory, name) });
}

it("matches native monochrome output for controlled bands and movement", async () => {
  const module = await loadModule();
  const count =
    Math.max(...reference.coordinates.map((point) => point[2]!)) + 1;
  expect(module._wled_init(count)).toBe(1);
  for (const point of reference.coordinates) {
    expect(module._equator_set_point(point[2]!, point[0]!, point[1]!)).toBe(1);
  }
  for (const frame of reference.frames) {
    const input = frame.input;
    if (frame.reset) {
      module._glitch_reset(input.seed);
      module._glitch_tick(
        input.effect,
        0,
        0,
        0,
        0,
        input.speed,
        input.intensity,
        input.primaryColor,
      );
    }
    module._glitch_tick(
      input.effect,
      input.now,
      input.bass,
      input.mid,
      input.treble,
      input.speed,
      input.intensity,
      input.primaryColor,
    );
    const start = module._wled_get_pixel_buffer() >>> 2;
    const pixels = reference.coordinates.map(
      (point) => module.HEAPU32[start + point[2]!]!,
    );
    expect(pixels, frame.name).toEqual(frame.pixels);
    for (const pixel of pixels) {
      const red = (pixel >>> 16) & 255;
      const green = (pixel >>> 8) & 255;
      const blue = pixel & 255;
      if (input.primaryColor === 0xff0000)
        expect([green, blue]).toEqual([0, 0]);
      else expect([green, blue]).toEqual([red, red]);
    }
  }
});

it("clears stale coordinates after resize and ignores invalid effect IDs", async () => {
  const module = await loadModule();
  expect(module._wled_init(1)).toBe(1);
  expect(module._equator_set_point(0, 0, 0)).toBe(1);
  module._glitch_reset(1);
  module._glitch_tick(2, 0, 255, 255, 0, 128, 128, 0xffffff);
  const start = module._wled_get_pixel_buffer() >>> 2;
  const previous = module.HEAPU32[start];
  expect(previous).not.toBe(0);
  module._glitch_tick(255, 20, 255, 255, 0, 128, 128, 0xffffff);
  expect(module.HEAPU32[start]).toBe(previous);
  expect(module._wled_resize(1)).toBe(1);
  module._glitch_tick(2, 40, 255, 255, 0, 128, 128, 0xffffff);
  expect(module.HEAPU32[module._wled_get_pixel_buffer() >>> 2]).toBe(0);
});
