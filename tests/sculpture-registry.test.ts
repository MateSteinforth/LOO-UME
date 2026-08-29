import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { describe, expect, it } from "vitest";
import registryJson from "../sculptures/manifest.json" with {
  type: "json",
};

interface ArtifactManifest {
  sculptureId: string;
  source: string;
  parts: Array<{ outputStl: string }>;
}

describe("processed sculpture registry", () => {
  it("lists every processed sculpture with a complete versioned artifact snapshot", () => {
    expect(registryJson.defaultSource).toBe(
      "./sculptures/rhombicosidodecahedron/sculpture.json",
    );
    expect(registryJson.sculptures).toHaveLength(15);
    expect(new Set(registryJson.sculptures.map((entry) => entry.id)).size).toBe(
      registryJson.sculptures.length,
    );
    expect(
      registryJson.sculptures.some(
        (entry) => entry.source === registryJson.defaultSource,
      ),
    ).toBe(true);

    for (const entry of registryJson.sculptures) {
      const sourcePath = entry.source.replace(/^\.\//, "");
      const definition = JSON.parse(readFileSync(sourcePath, "utf8")) as {
        id: string;
        name: string;
      };
      expect(definition).toMatchObject({
        id: entry.id,
        name: entry.name,
      });

      if (
        "artifactStatus" in entry &&
        (entry.artifactStatus === "authoring-only" ||
          entry.artifactStatus === "manual-parts")
      ) {
        continue;
      }

      const artifactRoot = "artifacts/sculptures/" + entry.id;
      const manifest = JSON.parse(
        readFileSync(artifactRoot + "/manifest.json", "utf8"),
      ) as ArtifactManifest;
      expect(manifest.sculptureId).toBe(entry.id);
      expect(manifest.source).toBe(sourcePath);

      const stlFiles = readdirSync(artifactRoot + "/3d")
        .filter((file) => file.endsWith(".stl"))
        .sort();
      expect(stlFiles).toEqual(
        manifest.parts.map((part) => part.outputStl).sort(),
      );
      expect(
        stlFiles.every(
          (file) => statSync(artifactRoot + "/3d/" + file).size > 1_000,
        ),
      ).toBe(true);
      expect(
        statSync(artifactRoot + "/previews/assembly.png").size,
      ).toBeGreaterThan(1_000);
      expect(
        statSync(artifactRoot + "/previews/closure-detail.png").size,
      ).toBeGreaterThan(1_000);
    }
  });
});
