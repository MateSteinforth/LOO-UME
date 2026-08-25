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
    fingerprint: "e3e96bbd",
    wledHash: "d7c1d336be10411cdc2c541ce4fa55d5f14ccfdab43703c4936a1ca8cf800daa",
  },
  {
    source: "sculptures/rhombicosidodecahedron-auto/sculpture.json",
    input: rhombicosidodecahedron,
    fingerprint: "f8031b35",
    wledHash: "262de5e4cc2f788361d6e99a3acc69a44c62a035cbf3b8d02a8df0d571d392e0",
  },
  {
    source: "sculptures/truncated-octahedron/sculpture.json",
    input: truncatedOctahedron,
    fingerprint: "794a9cb5",
    wledHash: "734f5ec6f7704b8b14f18456f8f3f8951dc35294107b51918df66591ab6f7b03",
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
