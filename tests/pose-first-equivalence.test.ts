import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import cuboctahedron from "../sculptures/cuboctahedron/sculpture.json" with {
  type: "json",
};
import rhombicosidodecahedron from "../sculptures/rhombicosidodecahedron-auto/sculpture.json" with {
  type: "json",
};
import truncatedOctahedron from "../sculptures/truncated-octahedron/sculpture.json" with {
  type: "json",
};
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const fixtures = [
  {
    source: "sculptures/cuboctahedron/sculpture.json",
    input: cuboctahedron,
    fingerprint: "c454e33d",
    wledHash: "d0e9a27b3cf5c430cf2728cf504486380c7d7676326db97655cd5358ccd52bca",
  },
  {
    source: "sculptures/rhombicosidodecahedron-auto/sculpture.json",
    input: rhombicosidodecahedron,
    fingerprint: "ef09eb05",
    wledHash: "9e2741adfdcc1eb600f133cea8a7bca52aa99f82be89c095e37c1344515ae6db",
  },
  {
    source: "sculptures/truncated-octahedron/sculpture.json",
    input: truncatedOctahedron,
    fingerprint: "a82275e5",
    wledHash: "b170b5e5affbc1f59681752cc72f77b7710f0b8fbfebe3f243d18f4028e274ee",
  },
] as const;

describe("pose-first migration equivalence", () => {
  for (const fixture of fixtures) {
    it(`preserves ${fixture.source} pose and WLED outputs byte-for-byte`, async () => {
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

    });
  }
});
