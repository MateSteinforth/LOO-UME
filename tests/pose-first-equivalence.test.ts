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
    fingerprint: "1915c35d",
    wledHash: "03d1bea6038d66743084cd0b7af9121ec35535043e6c7195fba70c22e3541446",
  },
  {
    source: "sculptures/rhombicosidodecahedron-auto/sculpture.json",
    input: rhombicosidodecahedron,
    fingerprint: "fbf0eec5",
    wledHash: "70cd6dde8f7cba7be8ebfeef946313a4f1bcd2501aa04f4a32340532ab9fee1c",
  },
  {
    source: "sculptures/truncated-octahedron/sculpture.json",
    input: truncatedOctahedron,
    fingerprint: "9c186ae5",
    wledHash: "7390c595d940caf01492a086da1e33bd80ca526683b80fd6d57efb70426b5888",
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
