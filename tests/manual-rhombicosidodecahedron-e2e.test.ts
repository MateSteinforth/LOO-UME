import { describe, expect, it } from "vitest";
import definitionJson from "../sculptures/rhombicosidodecahedron/sculpture.json" with {
  type: "json",
};
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

function loadProject() {
  return createPanelAssemblyProject(
    structuredClone(definitionJson),
    "sculptures/rhombicosidodecahedron/sculpture.json",
  );
}

describe("manual 41-panel pose-first sculpture", () => {
  it("uses explicit poses with a separate authored-mechanics contract", () => {
    const project = loadProject();

    expect(project.sculpture.schemaVersion).toBe("2.0.0");
    expect(project.sculpture.mechanicalShell).toBeUndefined();
    expect(project.sculpture.closures).toBeUndefined();
    expect(project.sculpture.manualMechanics).toMatchObject({
      kind: "manually-authored-parts",
      generator: "verified-scad-wrappers",
    });
    expect(project.sculpture.panels).toHaveLength(41);
    expect(project.sculpture.panels.filter(
      (panel) => panel.faceType === "square-face",
    )).toHaveLength(30);
    expect(project.sculpture.panels.filter(
      (panel) => panel.faceType === "pentagon-centre",
    )).toHaveLength(11);
    expect(() => compilePanelAssembly(project)).toThrow(
      "do not compile generic closure topology",
    );
  });

  it("preserves the golden mapping and four provisional outputs", () => {
    const project = loadProject();
    const mapping = createPanelAssemblyMapping(project);
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

    expect(mapping.panels).toHaveLength(41);
    expect(mapping.entries).toHaveLength(2_624);
    expect(mapping.surfaceFaces).toBeUndefined();
    expect(mapping.printableClosures).toBeUndefined();
    expect(wiring.outputs.map((output) => output.panelIds.length)).toEqual([
      11, 10, 10, 10,
    ]);
    expect(contract.fingerprint).toBe("31291c59");
  });
});
