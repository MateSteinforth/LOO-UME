import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertMechanicalShellReady,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  addPanelOnDesignSurface,
  automaticallySeedPanelsOnSurface,
  deletePanel,
  movePanelInLocalPlane,
  movePanelOnDesignSurface,
  rotatePanelAroundLocalZ,
  sculptureJson,
} from "../src/sculpture/SculptureEditor.ts";
import { deriveEditorCapabilities } from "../web/src/EditorCapabilities.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const surfaceMesh = {
  positions: [
    50, 50, 50,
    -50, -50, 50,
    -50, 50, -50,
    50, -50, -50,
  ],
  indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
};

const placement = {
  position: [0, 0, 50] as [number, number, number],
  orientation: {
    xAxis: [1, 0, 0] as [number, number, number],
    yAxis: [0, 1, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number],
  },
  attachment: {
    surface: "design-surface" as const,
    triangleIndex: 0,
    barycentric: [0.2, 0.3, 0.5] as [number, number, number],
    normalOffset: 0.4,
  },
};

describe("pose-only Schema 2 project", () => {
  it("loads the empty editor default without a mechanical shell", async () => {
    const loaded = await loadPanelAssemblyProjectFromFile(
      "sculptures/pose-only-empty/sculpture.json",
    );
    expect(loaded.sculpture.panels).toEqual([]);
    expect(loaded.sculpture).not.toHaveProperty("mechanicalShell");
    expect(loaded.sculpture).not.toHaveProperty("closures");
    expect(loaded.sculpture.designSurface).toMatchObject({
      format: "glb",
      source: "design/placement-surface.glb",
      scaleToMillimeters: 1,
      status: "watertight",
    });
    const glb = await readFile(
      "sculptures/pose-only-empty/design/placement-surface.glb",
    );
    expect(createHash("sha256").update(glb).digest("hex")).toBe(
      loaded.sculpture.designSurface!.sha256,
    );
    expect(createPanelAssemblyMapping(loaded).entries).toEqual([]);
    expect(deriveEditorCapabilities(loaded.sculpture, false)).toMatchObject({
      canAutomaticallySeed: false,
      canGenerateGenericMechanics: false,
    });
    expect(deriveEditorCapabilities(loaded.sculpture, true)).toMatchObject({
      canAutomaticallySeed: true,
      canGenerateGenericMechanics: false,
    });
  });

  it("loads, places, edits, maps, wires, saves, and reopens without mechanics", async () => {
    const loaded = await loadPanelAssemblyProjectFromFile(
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    expect(loaded.sculpture).not.toHaveProperty("mechanicalShell");
    expect(loaded.sculpture).not.toHaveProperty("closures");
    expect(loaded.sculpture.panels.every(
      (panel) => !panel.mountFaceId && !panel.surfaceAttachment,
    )).toBe(true);

    const initialMapping = createPanelAssemblyMapping(loaded);
    const initialWiring = createProvisionalWiringPreview(
      initialMapping,
      loaded.sculpture,
      loaded.panelProfile,
    );
    expect(initialMapping.entries).toHaveLength(128);
    expect(validateWiringPreview(initialWiring, initialMapping)).toEqual({
      valid: true,
      errors: [],
    });
    expect(deriveEditorCapabilities(loaded.sculpture, false)).toMatchObject({
      canSelectPanels: true,
      canTranslateInPanelPlane: true,
      canRotateSelectedPanel: true,
      canDeleteSelectedPanel: true,
      canExportMappingAndWiring: true,
      canGenerateGenericMechanics: true,
    });
    expect(deriveEditorCapabilities(loaded.sculpture, false, false))
      .toMatchObject({ canGenerateGenericMechanics: true });
    expect(() => assertMechanicalShellReady(loaded)).toThrow(
      /unavailable until generation input exists/,
    );

    let definition = structuredClone(loaded.sculpture);
    definition.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    expect(deriveEditorCapabilities(definition, true)).toMatchObject({
      canCreateOnActiveSurface: true,
      canAutomaticallySeed: true,
      canGenerateGenericMechanics: true,
    });

    const seeded = automaticallySeedPanelsOnSurface(
      definition,
      surfaceMesh,
      loaded.panelProfile.dimensions,
      {
        targetPanelCount: 3,
        surface: "design-surface",
        normalOffset: loaded.panelProfile.dimensions.thickness / 2,
      },
    );
    definition = seeded.definition;
    expect(seeded.placedPanelIds).toEqual(["P-03"]);
    expect(definition.panels[2]).not.toHaveProperty("mountFaceId");

    definition = movePanelOnDesignSurface(definition, "P-01", placement);
    definition = movePanelInLocalPlane(definition, "P-02", 2, -1);
    definition = rotatePanelAroundLocalZ(definition, "P-01", 15);
    definition = addPanelOnDesignSurface(definition, {
      ...placement,
      position: [0, 0, -50],
      attachment: { ...placement.attachment, triangleIndex: 1 },
    });
    definition = deletePanel(definition, "P-02");

    expect(definition.panels.map((panel) => panel.id)).toEqual([
      "P-01",
      "P-03",
      "P-04",
    ]);
    expect(definition.wiring.chainLengths).toEqual([3]);
    expect(definition).not.toHaveProperty("mechanicalShell");
    expect(definition).not.toHaveProperty("closures");
    expect(definition.notes.join(" ")).not.toMatch(
      /stale|awaiting regeneration|requires regeneration/i,
    );

    const reopenedDefinition = parsePanelAssemblyDefinition(
      JSON.parse(sculptureJson(definition)),
    );
    const reopened = createPanelAssemblyProject(
      reopenedDefinition,
      "local:pose-only-two-panel.sculpture.json",
      loaded.panelProfile,
    );
    const mapping = createPanelAssemblyMapping(reopened);
    const wiring = createProvisionalWiringPreview(
      mapping,
      reopened.sculpture,
      reopened.panelProfile,
    );
    const contract = createHardwareMappingContract(
      mapping,
      wiring,
      reopened.panelProfile,
    );

    expect(mapping.panels).toHaveLength(3);
    expect(mapping.entries).toHaveLength(192);
    expect(mapping.surfaceFaces).toBeUndefined();
    expect(mapping.printableClosures).toBeUndefined();
    expect(validateWiringPreview(wiring, mapping).valid).toBe(true);
    expect(contract.ledmap.map).toHaveLength(192);
    expect(contract.outputs[0]).toMatchObject({ panelIds: expect.any(Array) });
    expect(reopened.sculpture.designSurface?.source).toBe("design/source.glb");
  });

  it("accepts an empty pose-only project without adding a placeholder shell", async () => {
    const loaded = await loadPanelAssemblyProjectFromFile(
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const empty = structuredClone(loaded.sculpture);
    empty.panels = [];
    empty.wiring.chainLengths = [0];
    const parsed = parsePanelAssemblyDefinition(
      JSON.parse(sculptureJson(empty)),
    );
    expect(parsed.panels).toEqual([]);
    expect(parsed).not.toHaveProperty("mechanicalShell");
    expect(createPanelAssemblyMapping(
      createPanelAssemblyProject(parsed, "empty.json", loaded.panelProfile),
    ).entries).toEqual([]);
  });
});
