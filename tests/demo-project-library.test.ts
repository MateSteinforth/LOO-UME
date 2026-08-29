import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import { readProjectPackageSummary } from "../web/src/ProjectPackage.ts";
import {
  openPortableProjectZip,
  unzipPortableProjectFiles,
} from "../web/src/PortableProject.ts";

interface DemoRegistry {
  schemaVersion: "1.0.0";
  defaultSource: string;
  projects: Array<{ id: string; name: string; source: string }>;
}

describe("tracked demo project library", () => {
  it("contains one valid ZIP package for every authored project", async () => {
    const authored = JSON.parse(
      await readFile("sculptures/manifest.json", "utf8"),
    ) as { sculptures: Array<{ id: string; name: string; source: string }> };
    const library = JSON.parse(
      await readFile("projects/manifest.json", "utf8"),
    ) as DemoRegistry;
    expect(library.projects).toHaveLength(authored.sculptures.length);
    expect(library.projects.map(({ id }) => id)).toEqual(
      authored.sculptures.map(({ id }) => id),
    );
    for (const [index, entry] of library.projects.entries()) {
      const bytes = new Uint8Array(await readFile(entry.source.replace(/^\.\//, "")));
      const summary = readProjectPackageSummary(bytes);
      expect(summary.manifest).toMatchObject({
        id: entry.id,
        name: entry.name,
        thumbnail: "thumbnail.png",
      });
      expect(summary.thumbnailMediaType).toBe("image/png");
      expect([...summary.thumbnailBytes.subarray(0, 4)])
        .toEqual([0x89, 0x50, 0x4e, 0x47]);
      if (entry.id === "one-metre-flexible-led-ring-demo") {
        expect(
          unzipPortableProjectFiles(bytes)
            .some(({ path }) => path.endsWith("/panel-profile.json")),
        ).toBe(true);
      }
      const bundle = await openPortableProjectZip(
        bytes,
        entry.source,
        async () => JSON.parse(
          await readFile("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
        ) as unknown,
        { create: () => "blob:test", revoke: () => undefined },
      );
      const authoredJson = JSON.parse(
        await readFile(authored.sculptures[index]!.source.replace(/^\.\//, ""), "utf8"),
      ) as unknown;
      expect(JSON.parse(sculptureJson(bundle.project.sculpture))).toEqual(authoredJson);
      bundle.dispose();
    }
  });
});
