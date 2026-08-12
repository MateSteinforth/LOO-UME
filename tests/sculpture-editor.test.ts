import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  compilePanelAssembly,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { addPanelToClosureFace } from "../src/sculpture/SculptureEditor.ts";

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
});
