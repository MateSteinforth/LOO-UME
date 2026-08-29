import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createUniformSphereMapping,
} from "../web/src/LedMapping.ts";
import {
  createInwardCableControlPoint,
  createProvisionalWiringPreview,
  createWiringControllerLayout,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";

function loadFixture() {
  const source = "sculptures/rhombicosidodecahedron/sculpture.json";
  const project = createPanelAssemblyProject(
    JSON.parse(readFileSync(source, "utf8")),
    source,
  );
  return { project, mapping: createPanelAssemblyMapping(project) };
}

function loadDraftFixture() {
  const { project } = loadFixture();
  const definition = structuredClone(project.sculpture);
  definition.wiring.status = "provisional";
  delete definition.wiring.routeRevision;
  for (const output of definition.wiring.outputs) {
    delete output.panelIds;
    output.gpio = null;
  }
  for (const panel of definition.panels) {
    if (panel.installedAddressTransform?.selectionMethod === "route-optimized") {
      panel.installedAddressTransform.selectionMethod = "manual";
      delete panel.installedAddressTransform.optimizationFingerprint;
    }
  }
  const draftProject = createPanelAssemblyProject(definition, project.source);
  return { project: draftProject, mapping: createPanelAssemblyMapping(draftProject) };
}

describe("provisional wiring preview", () => {
  it("bends cable curves inside the panel endpoint radius", () => {
    const control = createInwardCableControlPoint(
      { x: 100, y: 0, z: 0 },
      { x: 80, y: 60, z: 0 },
      { x: 0, y: 0, z: 0 },
    );
    expect(Math.hypot(control.x, control.y, control.z)).toBeCloseTo(82, 10);
    expect(control.x).toBeGreaterThan(0);
    expect(control.y).toBeGreaterThan(0);
  });

  it("creates four complete and continuous output routes", () => {
    const { project, mapping } = loadDraftFixture();
    const preview = createProvisionalWiringPreview(
      mapping, project.sculpture, project.panelProfile,
    );

    expect(validateWiringPreview(preview, mapping)).toEqual({
      valid: true,
      errors: [],
    });
    expect(preview.status).toBe("draft");
    expect(preview.controller).toEqual({
      placement: "near-top",
      status: "provisional",
    });
    expect(preview.outputs).toHaveLength(4);
    expect(preview.outputs.map((output) => output.panelIds.length)).toEqual([
      11, 10, 10, 10,
    ]);
    expect(preview.outputs.every((output) => output.gpio === null)).toBe(true);
    for (const output of preview.outputs) {
      const panels = output.panelIds.map((panelId) =>
        mapping.panels.find((panel) => panel.id === panelId),
      );
      expect(panels[0]?.position.y).toBe(
        Math.max(...panels.map((panel) => panel!.position.y)),
      );
    }

    const routedPanelIds = preview.outputs.flatMap(
      (output) => output.panelIds,
    );
    expect(routedPanelIds).toHaveLength(41);
    expect(new Set(routedPanelIds).size).toBe(41);
    expect(preview.nodes).toHaveLength(41);
    const controller = createWiringControllerLayout(preview)!;
    expect(controller.pins).toHaveLength(4);
    expect(controller.position.y).toBeGreaterThan(
      Math.max(...preview.nodes.flatMap((node) => [node.din.y, node.dout.y])),
    );
    preview.controller!.position = [12, 34, 56];
    preview.controller!.orientation = {
      xAxis: [0, 1, 0],
      yAxis: [-1, 0, 0],
      normal: [0, 0, 1],
    };
    const positionedController = createWiringControllerLayout(preview)!;
    expect(positionedController.position).toEqual({ x: 12, y: 34, z: 56 });
    expect(positionedController.orientation).toEqual({
      xAxis: { x: 0, y: 1, z: 0 },
      yAxis: { x: -1, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    });
    expect(positionedController.pins).toHaveLength(4);
    expect(positionedController.pins[0]!.position).toEqual({
      x: 20,
      y: 20.5,
      z: 56,
    });

    for (const node of preview.nodes) {
      const panel = mapping.panels.find(
        (candidate) => candidate.id === node.panelId,
      )!;
      const dinRelative = {
        x: node.din.x - panel.position.x,
        y: node.din.y - panel.position.y,
        z: node.din.z - panel.position.z,
      };
      const doutRelative = {
        x: node.dout.x - panel.position.x,
        y: node.dout.y - panel.position.y,
        z: node.dout.z - panel.position.z,
      };
      const local = (
        value: typeof dinRelative,
        axis: typeof panel.xAxis,
      ): number => value.x * axis.x + value.y * axis.y + value.z * axis.z;

      expect(Number.isFinite(node.din.x)).toBe(true);
      expect(Number.isFinite(node.din.y)).toBe(true);
      expect(Number.isFinite(node.din.z)).toBe(true);
      expect(Number.isFinite(node.dout.x)).toBe(true);
      expect(Number.isFinite(node.dout.y)).toBe(true);
      expect(Number.isFinite(node.dout.z)).toBe(true);
      expect(node.din).not.toEqual(node.dout);
      expect(local(dinRelative, panel.xAxis)).toBeLessThan(0);
      expect(local(dinRelative, panel.yAxis)).toBeGreaterThan(0);
      expect(local(doutRelative, panel.xAxis)).toBeGreaterThan(0);
      expect(local(doutRelative, panel.yAxis)).toBeLessThan(0);
      expect(local(dinRelative, panel.normal)).toBeLessThan(0);
      expect(local(doutRelative, panel.normal)).toBeLessThan(0);
      expect(node.connectorReferenceView).toBe("back");
      expect(node.dinCorner).toBe("top-right");
      expect(node.doutCorner).toBe("bottom-left");
      expect(node.dinDoutAssignmentStatus).toBe("measured");
    }
  });

  it("does not invent wiring for the uniform fallback mapping", () => {
    const mapping = createUniformSphereMapping(1024);
    const preview = createProvisionalWiringPreview(mapping);

    expect(preview.status).toBe("unavailable");
    expect(preview.controller).toBeNull();
    expect(preview.outputs).toEqual([]);
    expect(preview.nodes).toEqual([]);
  });

  it("rejects a mixed authored and draft route instead of applying the heuristic", () => {
    const { project, mapping } = loadDraftFixture();
    const draft = createProvisionalWiringPreview(
      mapping, project.sculpture, project.panelProfile,
    );
    const definition = structuredClone(project.sculpture);
    definition.wiring.outputs[0]!.panelIds = [
      ...draft.outputs[0]!.panelIds,
    ];

    expect(() => createProvisionalWiringPreview(
      mapping, definition, project.panelProfile,
    )).toThrow(
      /every output/,
    );

    const malformed = structuredClone(project.sculpture);
    for (const output of malformed.wiring.outputs) {
      (output as unknown as { panelIds: unknown }).panelIds = null;
    }
    expect(() => createProvisionalWiringPreview(
      mapping, malformed, project.panelProfile,
    )).toThrow(
      /every output/,
    );
  });
});
