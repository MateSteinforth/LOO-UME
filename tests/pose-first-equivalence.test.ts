import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import cuboctahedron from "../sculptures/cuboctahedron/sculpture.json" with {
  type: "json",
};
import rhombicosidodecahedron from "../sculptures/rhombicosidodecahedron-auto/sculpture.json" with {
  type: "json",
};
import truncatedOctahedron from "../sculptures/truncated-octahedron/sculpture.json" with {
  type: "json",
};
import { emitPanelClosureCadArtifacts } from "../src/cad/GeneratePanelClosureCad.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const temporaryDirectories: string[] = [];

const fixtures = [
  {
    source: "sculptures/cuboctahedron/sculpture.json",
    input: cuboctahedron,
    fingerprint: "2ffe135d",
    cadHash: "9a8feea76654120c45ffaa9eaea0c75f1b3ce4352d41bb8982c2a232e87221a4",
    wledHash: "d0e9a27b3cf5c430cf2728cf504486380c7d7676326db97655cd5358ccd52bca",
  },
  {
    source: "sculptures/rhombicosidodecahedron-auto/sculpture.json",
    input: rhombicosidodecahedron,
    fingerprint: "93987755",
    cadHash: "6c38e230830766bb7734b20d0bd4b61b4b76bd26f0e6fbc04e93929e8193eda4",
    wledHash: "9e2741adfdcc1eb600f133cea8a7bca52aa99f82be89c095e37c1344515ae6db",
  },
  {
    source: "sculptures/truncated-octahedron/sculpture.json",
    input: truncatedOctahedron,
    fingerprint: "b7169f35",
    cadHash: "14adbc5fc1ab7f3038033bca6dc6736e012d3bbfde55a6bdd8c53ec6520051cc",
    wledHash: "b170b5e5affbc1f59681752cc72f77b7710f0b8fbfebe3f243d18f4028e274ee",
  },
] as const;

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      if (
        name !== "manifest.json" &&
        !(name.startsWith("closure-") && name.endsWith(".scad"))
      ) continue;
      const path = join(directory, name);
      if ((await stat(path)).isDirectory()) {
        await walk(path);
      } else {
        hash.update(relative(root, path));
        hash.update("\0");
        hash.update(await readFile(path));
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("pose-first migration equivalence", () => {
  for (const fixture of fixtures) {
    it(`preserves ${fixture.source} CAD and WLED outputs byte-for-byte`, async () => {
      const project = createPanelAssemblyProject(
        structuredClone(fixture.input),
        fixture.source,
      );
      expect(project.sculpture.schemaVersion).toBe("2.0.0");
      expect(
        project.sculpture.panels.every(
          (panel) =>
            panel.pose.position.length === 3 &&
            panel.pose.orientation.xAxis.length === 3 &&
            panel.pose.orientation.yAxis.length === 3 &&
            panel.pose.orientation.normal.length === 3,
        ),
      ).toBe(true);

      const assembly = compilePanelAssembly(project);
      for (const sourcePanel of project.sculpture.panels) {
        const compiled = assembly.panels.find(
          (panel) => panel.id === sourcePanel.id,
        )!;
        expect([
          compiled.position.x,
          compiled.position.y,
          compiled.position.z,
        ]).toEqual(sourcePanel.pose.position);
      }

      const mapping = createPanelAssemblyMapping(project, assembly);
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
      expect(contract.fingerprint).toBe(fixture.fingerprint);
      expect(
        createHash("sha256")
          .update(`${JSON.stringify(contract.ledmap)}\n`)
          .digest("hex"),
      ).toBe(fixture.wledHash);

      const outputDirectory = await mkdtemp(
        join(tmpdir(), "pose-first-equivalence-"),
      );
      temporaryDirectories.push(outputDirectory);
      await emitPanelClosureCadArtifacts(project, { outputDirectory });
      expect(await hashDirectory(outputDirectory)).toBe(fixture.cadHash);
    });
  }
});
