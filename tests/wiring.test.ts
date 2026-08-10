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
      expect(Number.isFinite(node.din.x)).toBe(true);
      expect(Number.isFinite(node.din.y)).toBe(true);
      expect(Number.isFinite(node.din.z)).toBe(true);
      expect(Number.isFinite(node.dout.x)).toBe(true);
      expect(Number.isFinite(node.dout.y)).toBe(true);
      expect(Number.isFinite(node.dout.z)).toBe(true);
      expect(node.din).not.toEqual(node.dout);
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
