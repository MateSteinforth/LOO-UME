import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { compileEquatorMapping } from "../src/effects/EquatorMapping.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import reference from "./fixtures/equator-wave-reference.json" with { type: "json" };

interface EquatorModule {
  HEAPU32: Uint32Array;
  _wled_init(count: number): number;
  _wled_resize(count: number): number;
  _wled_get_pixel_buffer(): number;
  _equator_reset(seed: number): void;
  _equator_set_point(index: number, longitude: number, height: number): number;
  _equator_tick(
    time: number,
    bass: number,
    treble: number,
    speed: number,
    intensity: number,
    color: number,
  ): void;
}

async function loadModule(): Promise<EquatorModule> {
  const directory = path.resolve("web/public/wasm");
  const imported = (await import(
    pathToFileURL(path.join(directory, "wled-engine.js")).href
  )) as {
    default(options: {
      locateFile(name: string): string;
    }): Promise<EquatorModule>;
  };
  return imported.default({ locateFile: (name) => path.join(directory, name) });
}

describe("shared Equator Wave renderer", () => {
  it("matches native C++ output for every controlled audio frame", async () => {
    const module = await loadModule();
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
      process.cwd(),
    );
    const points = compileEquatorMapping(
      createPanelAssemblyMapping(project).entries,
    );
    expect(module._wled_init(points.length)).toBe(1);
    module._equator_reset(0x1a2b3c4d);
    for (const [index, point] of points.entries())
      expect(
        module._equator_set_point(index, point.longitude, point.height),
      ).toBe(1);
    for (const frame of reference.frames) {
      module._equator_tick(
        frame.time,
        frame.bass,
        frame.treble,
        128,
        128,
        0xff7a18,
      );
      const start = module._wled_get_pixel_buffer() >>> 2;
      const pixels = module.HEAPU32.subarray(start, start + points.length);
      expect(
        Array.from(pixels).flatMap((color, index) =>
          color ? [[index, color]] : [],
        ),
        `RGB frame ${frame.time}`,
      ).toEqual(frame.pixels);
      let checksum = 2166136261;
      let lit = 0;
      for (const color of pixels) {
        checksum = Math.imul(checksum ^ color, 16777619) >>> 0;
        if (color !== 0) lit += 1;
      }
      expect({ checksum, lit }, `frame ${frame.time}`).toEqual({
        checksum: frame.checksum,
        lit: frame.lit,
      });
    }
    expect(reference.frames.some((frame) => frame.lit > 0)).toBe(true);
    expect(reference.frames.at(-1)?.lit).toBe(0);
  });

  it("rejects invalid coordinates and clears mapping on resize", async () => {
    const module = await loadModule();
    expect(module._wled_init(1)).toBe(1);
    expect(module._equator_set_point(1, 0, 0)).toBe(0);
    expect(module._equator_set_point(0, -1, 0)).toBe(0);
    expect(module._equator_set_point(0, 65536, 0)).toBe(0);
    expect(module._equator_set_point(0, 0, -32768)).toBe(0);
    expect(module._equator_set_point(0, 0, 32768)).toBe(0);
    expect(module._equator_set_point(0, 0, 0)).toBe(1);
    module._equator_reset(1);
    module._equator_tick(0, 220, 0, 128, 128, 0xff7a18);
    expect(module.HEAPU32[module._wled_get_pixel_buffer() >>> 2]).not.toBe(0);
    expect(module._wled_resize(1)).toBe(1);
    module._equator_tick(24, 220, 0, 128, 128, 0xff7a18);
    expect(module.HEAPU32[module._wled_get_pixel_buffer() >>> 2]).toBe(0);
  });

  it("pins the shared firmware header in the browser receipt", () => {
    const receipt = JSON.parse(
      readFileSync("web/public/wasm/runtime-integrity.json", "utf8"),
    ) as { source: { equatorWaveHeader: { sha256: string } } };
    const hash = createHash("sha256")
      .update(readFileSync("firmware/equator-wave/EquatorWave.h"))
      .digest("hex");
    expect(receipt.source.equatorWaveHeader.sha256).toBe(hash);
  });
});
