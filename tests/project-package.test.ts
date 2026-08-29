import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parsePanelAssemblyDefinition } from "../src/sculpture/PanelAssembly.ts";
import {
  createProjectPackageZip,
  createProjectThumbnailSvg,
  readProjectPackageSummary,
} from "../web/src/ProjectPackage.ts";
import { openPortableProjectZip } from "../web/src/PortableProject.ts";

describe("ZIP project package", () => {
  it("embeds deterministic metadata and a pose-derived thumbnail", async () => {
    const definition = parsePanelAssemblyDefinition(JSON.parse(
      await readFile("sculptures/rhombicosidodecahedron/sculpture.json", "utf8"),
    ));
    const first = createProjectPackageZip(definition, new Map());
    const second = createProjectPackageZip(definition, new Map());
    expect(first).toEqual(second);
    const summary = readProjectPackageSummary(first);
    expect(summary.manifest).toMatchObject({
      id: definition.id,
      name: definition.name,
      panelCount: 41,
      thumbnail: "thumbnail.svg",
    });
    expect(new TextDecoder().decode(summary.thumbnailBytes)).toContain("<svg");
    const reopened = await openPortableProjectZip(
      first,
      "demo.loo.zip",
      async () => JSON.parse(
        await readFile("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
      ) as unknown,
      { create: () => "blob:test", revoke: () => undefined },
    );
    expect(reopened.project.sculpture.id).toBe(definition.id);
    reopened.dispose();
  });

  it("renders a useful empty-project thumbnail", async () => {
    const definition = parsePanelAssemblyDefinition(JSON.parse(
      await readFile("sculptures/pose-only-empty/sculpture.json", "utf8"),
    ));
    const svg = new TextDecoder().decode(createProjectThumbnailSvg(definition));
    expect(svg).toContain("stroke-dasharray");
    expect(svg).not.toContain("<script");
  });

  it("embeds a rendered PNG thumbnail without changing the ZIP schema", async () => {
    const definition = parsePanelAssemblyDefinition(JSON.parse(
      await readFile("sculptures/rhombicosidodecahedron/sculpture.json", "utf8"),
    ));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const summary = readProjectPackageSummary(createProjectPackageZip(
      definition,
      new Map(),
      definition.id,
      { bytes: png, mediaType: "image/png" },
    ));
    expect(summary.manifest.thumbnail).toBe("thumbnail.png");
    expect(summary.thumbnailMediaType).toBe("image/png");
    expect(summary.thumbnailBytes).toEqual(png);
  });
});
