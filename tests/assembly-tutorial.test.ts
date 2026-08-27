import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createUniformSphereMapping } from "../web/src/LedMapping.ts";
import {
  createAssemblyTutorialModel,
  maskedPanelPositions,
  tutorialBackViewFrame,
} from "../web/src/AssemblyTutorial.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function tutorialFor(source: string) {
  const project = await loadPanelAssemblyProjectFromFile(source, process.cwd());
  const mapping = createPanelAssemblyMapping(project);
  const preview = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  return createAssemblyTutorialModel(preview);
}

describe("Schema 2 assembly tutorial", () => {
  it("derives the exact flagship chains and cable instructions", async () => {
    const model = await tutorialFor(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );

    expect(model.chains).toHaveLength(4);
    expect(model.chains.map((chain) => chain.panels.length)).toEqual([
      11, 10, 10, 10,
    ]);
    expect(model.chains[0]).toMatchObject({
      outputIndex: 0,
      label: "Output 1",
      gpio: 16,
      routeStatus: "exact",
      routeWarning: "Saved data route",
    });
    expect(model.chains[0]!.panels[0]).toEqual({
      id: "SQ-03",
      chainPosition: 0,
      label: "1 / 11 · SQ-03",
    });
    expect(model.chains[0]!.connections[0]!.instruction).toBe(
      "Controller GPIO 16 → SQ-03 DIN (top-right, back view)",
    );
    expect(model.chains[0]!.connections[0]!.start).not.toBeNull();
    expect(model.chains[0]!.connections[1]!.instruction).toBe(
      "SQ-03 DOUT (bottom-left, back view) → SQ-04 DIN (top-right, back view)",
    );
    expect(model.chains.flatMap((chain) => chain.panels)).toHaveLength(41);
    expect(new Set(
      model.chains.map((chain) => JSON.stringify(chain.controllerPosition)),
    ).size).toBe(1);
    expect(new Set(
      model.chains.map((chain) => JSON.stringify(chain.connections[0]!.start)),
    ).size).toBe(4);
  });

  it("uses the saved panel frame for an arbitrary 6DOF back view", () => {
    const frame = tutorialBackViewFrame({
      normal: { x: 0.36, y: -0.48, z: 0.8 },
      yAxis: { x: 0.8, y: 0.6, z: 0 },
    });
    expect(frame).toEqual({
      cameraDirection: { x: -0.36, y: 0.48, z: -0.8 },
      cameraUp: { x: 0.8, y: 0.6, z: 0 },
    });
    const dot =
      frame.cameraDirection.x * frame.cameraUp.x +
      frame.cameraDirection.y * frame.cameraUp.y +
      frame.cameraDirection.z * frame.cameraUp.z;
    expect(dot).toBeCloseTo(0, 12);
  });

  it("supports an arbitrary draft Schema 2 project without inventing a GPIO", async () => {
    const model = await tutorialFor(
      "sculptures/panel-outline-prism/sculpture.json",
    );

    expect(model.chains).toHaveLength(1);
    expect(model.chains[0]).toMatchObject({
      gpio: null,
      routeStatus: "draft",
      routeWarning: "DRAFT ROUTE — save the route before physical assembly.",
    });
    expect(model.chains[0]!.panels).toHaveLength(4);
    expect(model.chains[0]!.connections[0]!.instruction).toMatch(
      /^Controller output 1 \(GPIO unassigned\) → .+ DIN/,
    );
  });

  it("keeps the stronger warning for every review-required route source", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
      process.cwd(),
    );
    const preview = createProvisionalWiringPreview(
      createPanelAssemblyMapping(project),
      project.sculpture,
      project.panelProfile,
    );
    for (const source of [
      "authored-route",
      "temporary-draft-suggestion",
    ] as const) {
      const model = createAssemblyTutorialModel({
        ...preview,
        status: "requires-review",
        routeSource: source,
      });
      expect(model.chains[0]).toMatchObject({
        routeStatus: "requires-review",
        routeWarning:
          "ROUTE REQUIRES REVIEW — confirm and save it before physical assembly.",
      });
    }
  });

  it("masks non-chain geometry without changing the source positions", () => {
    const source = Float32Array.from([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ]);
    const masked = maskedPanelPositions(
      source,
      ["P-01", "P-02", null],
      new Set(["P-02"]),
    );

    expect([...source]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Number.isNaN(masked[0])).toBe(true);
    expect([...masked.slice(3, 6)]).toEqual([4, 5, 6]);
    expect(Number.isNaN(masked[6])).toBe(true);
    expect([...maskedPanelPositions(source, ["P-01", "P-02", null], null)])
      .toEqual([...source]);
  });

  it("returns no tutorial chains for a non-panelized display", () => {
    const preview = createProvisionalWiringPreview(createUniformSphereMapping(64));
    expect(createAssemblyTutorialModel(preview)).toEqual({ chains: [] });
  });
});
