import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import type { PanelAssemblyDefinition } from "../src/sculpture/PanelAssembly.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import { createEditorPipelineFormData } from "../web/src/EditorPipelineRequest.ts";

const GLB = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46,
  0x02, 0x00, 0x00, 0x00,
  0x0c, 0x00, 0x00, 0x00,
]);

async function fixture(
  bytes: Uint8Array = GLB,
): Promise<PanelAssemblyDefinition> {
  const project = await loadPanelAssemblyProjectFromFile(
    "sculptures/pose-only-two-panel/sculpture.json",
  );
  const definition = structuredClone(project.sculpture);
  definition.designSurface = {
    kind: "triangle-mesh",
    format: "glb",
    source: "design/source.glb",
    sha256: sha256Bytes(bytes),
    scaleToMillimeters: 1,
    status: "watertight",
  };
  return definition;
}

describe("editor pipeline multipart request", () => {
  it("serializes a project without a design surface as one sculpture field", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const formData = createEditorPipelineFormData(project.sculpture, new Map());

    expect([...formData.keys()]).toEqual(["sculpture"]);
    expect(formData.get("sculpture")).toBe(sculptureJson(project.sculpture));
    expect(formData.get("designSurface")).toBeNull();
  });

  it("includes exact GLB bytes and omits unrelated assets", async () => {
    const definition = await fixture();
    const formData = createEditorPipelineFormData(
      definition,
      new Map([
        ["design/source.glb", GLB],
        ["unrelated/old-part.stl", Uint8Array.of(1, 2, 3)],
      ]),
    );

    expect([...formData.keys()]).toEqual(["sculpture", "designSurface"]);
    expect(formData.get("sculpture")).toBe(sculptureJson(definition));
    const designSurface = formData.get("designSurface");
    expect(designSurface).toBeInstanceOf(Blob);
    expect(designSurface).not.toBeNull();
    expect(new Uint8Array(await (designSurface as Blob).arrayBuffer()))
      .toEqual(GLB);
    expect((designSurface as Blob).type).toBe("model/gltf-binary");
    expect(formData.get("unrelated/old-part.stl")).toBeNull();
  });

  it("rejects missing referenced GLB bytes", async () => {
    const definition = await fixture();
    expect(() => createEditorPipelineFormData(definition, new Map()))
      .toThrow(/design\/source\.glb.*not available as verified local bytes/);
  });

  it("rejects tampered referenced GLB bytes", async () => {
    const definition = await fixture();
    const tampered = Uint8Array.from(GLB);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => createEditorPipelineFormData(
      definition,
      new Map([["design/source.glb", tampered]]),
    )).toThrow(/Design surface.*failed SHA-256 verification/);
  });
});
