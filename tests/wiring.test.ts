import { describe, expect, it } from "vitest";
import {
  createPanelizedSculptureMapping,
  createUniformSphereMapping,
} from "../web/src/LedMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

describe("provisional wiring preview", () => {
  it("creates four complete and continuous output routes", () => {
    const mapping = createPanelizedSculptureMapping();
    const preview = createProvisionalWiringPreview(mapping);

    expect(validateWiringPreview(preview, mapping)).toEqual({
      valid: true,
      errors: [],
    });
    expect(preview.status).toBe("generated-provisional");
    expect(preview.outputs).toHaveLength(4);
    expect(preview.outputs.map((output) => output.panelIds.length)).toEqual([
      11, 10, 10, 10,
    ]);
    expect(preview.outputs.every((output) => output.gpio === null)).toBe(true);

    const routedPanelIds = preview.outputs.flatMap(
      (output) => output.panelIds,
    );
    expect(routedPanelIds).toHaveLength(41);
    expect(new Set(routedPanelIds).size).toBe(41);
    expect(preview.nodes).toHaveLength(41);

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
      expect(node.connectorDiagonal).toBe("top-left-to-bottom-right");
      expect(node.dinDoutAssignmentStatus).toBe("provisional");
    }
  });

  it("does not invent wiring for the uniform fallback mapping", () => {
    const mapping = createUniformSphereMapping(1024);
    const preview = createProvisionalWiringPreview(mapping);

    expect(preview.status).toBe("unavailable");
    expect(preview.outputs).toEqual([]);
    expect(preview.nodes).toEqual([]);
  });
});
