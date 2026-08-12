import { readFile } from "node:fs/promises";
import {
  createMechanicalShellTriangleMesh,
} from "../src/sculpture/DesignSurface.ts";
import { describe, expect, it } from "vitest";
import {
  assertMechanicalShellReady,
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  addPanelOnDesignSurface,
  addPanelToClosureFace,
  deletePanel,
  movePanelOnDesignSurface,
} from "../src/sculpture/SculptureEditor.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

describe("browser sculpture editor", () => {
  it("insets a panel and leaves a pipeline-compilable closure ring", async () => {
    const source: unknown = JSON.parse(
      await readFile(
        "sculptures/truncated-octahedron/sculpture.json",
        "utf8",
      ),
    );
    const original = parsePanelAssemblyDefinition(source);
    const originalProject = createPanelAssemblyProject(
      original,
      "editor-test.json",
    );
    const faceId = original.closures.faceIds[0]!;
    const edited = addPanelToClosureFace(
      original,
      faceId,
      originalProject.panelProfile.dimensions,
    );

    expect(original.panels).toHaveLength(6);
    expect(original.closures.faceIds).toContain(faceId);
    expect(edited.panels).toHaveLength(7);
    expect(edited.closures.faceIds).not.toContain(faceId);
    expect(edited.closures.faceIds.length).toBeGreaterThan(
      original.closures.faceIds.length,
    );
    expect(
      edited.wiring.chainLengths.reduce((sum, value) => sum + value, 0),
    ).toBe(7);

    const project = createPanelAssemblyProject(edited, "editor-test.json");
    const assembly = compilePanelAssembly(project);
    expect(assembly.counts.panels).toBe(7);
    const addedPanel = assembly.panels.find((panel) => panel.id === "P-07")!;
    const assignedHoles = addedPanel.mountingHoles.filter(
      (hole) => hole.assignedClosureId !== null,
    );
    expect(assignedHoles).toHaveLength(4);
    expect(
      new Set(assignedHoles.map((hole) => hole.assignedClosureId)).size,
    ).toBe(3);
    expect(assembly.counts.closureConnectors).toBeGreaterThan(0);
  });

  it("persists a GLB surface attachment and invalidates stale CAD", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const withSurface = structuredClone(original);
    withSurface.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "blob.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1000,
      status: "watertight",
    };
    const edited = movePanelOnDesignSurface(withSurface, "P-01", {
      position: [10, 20, 30],
      orientation: {
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1],
      },
      attachment: {
        triangleIndex: 12,
        barycentric: [0.2, 0.3, 0.5],
        normalOffset: 0.4,
      },
    });

    expect(edited.panels[0]!.pose.position).toEqual([10, 20, 30]);
    expect(edited.panels[0]!.surfaceAttachment).toEqual({
      triangleIndex: 12,
      barycentric: [0.2, 0.3, 0.5],
      normalOffset: 0.4,
    });
    expect(edited.mechanicalShell.derivationStatus).toBe(
      "requires-regeneration",
    );
    const project = createPanelAssemblyProject(edited, "editor-test.json");
    expect(() => assertMechanicalShellReady(project)).toThrow(
      /out of date/,
    );
  });

  it("adds a JSON-shell panel without a GLB and persists its surface", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const shellSurface = createMechanicalShellTriangleMesh(original);
    expect(shellSurface.validation.watertight).toBe(true);
    expect(shellSurface.validation.triangleCount).toBeGreaterThan(0);
    const edited = addPanelOnDesignSurface(original, {
      position: [10, 20, 30],
      orientation: {
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1],
      },
      attachment: {
        surface: "mechanical-shell",
        triangleIndex: 7,
        barycentric: [0.2, 0.3, 0.5],
        normalOffset: 0.4,
      },
    });

    const added = edited.panels.at(-1)!;
    expect(added.id).toBe("P-07");
    expect(added.mountFaceId).toBeUndefined();
    expect(added.surfaceAttachment?.surface).toBe("mechanical-shell");
    expect(
      edited.wiring.chainLengths.reduce((sum, value) => sum + value, 0),
    ).toBe(7);
    const project = createPanelAssemblyProject(
      JSON.parse(JSON.stringify(edited)),
      "editor-test.json",
    );
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    expect(mapping.panels).toHaveLength(7);
    expect(mapping.entries).toHaveLength(7 * 64);
    expect(mapping.mechanicalMounts).toBeUndefined();
    expect(mapping.printableClosures).toBeUndefined();
    expect(wiring.nodes.some((node) => node.panelId === "P-07")).toBe(true);
    expect(() => assertMechanicalShellReady(project)).toThrow(/out of date/);

    const deleted = deletePanel(edited, "P-07");
    const restored = createPanelAssemblyProject(
      JSON.parse(JSON.stringify(deleted)),
      "editor-test.json",
    );
    expect(restored.sculpture.panels).toHaveLength(6);
    expect(restored.sculpture.wiring.chainLengths.reduce((sum, value) => sum + value, 0)).toBe(6);
    expect(createPanelAssemblyMapping(restored).panels).toHaveLength(6);
  });

  it("rejects surface attachments without a design-surface GLB", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const invalid = parsePanelAssemblyDefinition(source);
    invalid.panels[0]!.surfaceAttachment = {
      triangleIndex: 0,
      barycentric: [1, 0, 0],
      normalOffset: 0.4,
    };
    expect(() => parsePanelAssemblyDefinition(invalid)).toThrow(/Panels require/);
  });
});
