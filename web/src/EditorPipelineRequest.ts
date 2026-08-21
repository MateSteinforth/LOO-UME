import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import { verifyProjectAssetBytes } from "../../src/sculpture/GeneratedMechanics.ts";
import { sculptureJson } from "../../src/sculpture/SculptureEditor.ts";

export function createEditorPipelineFormData(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
): FormData {
  const formData = new FormData();
  formData.set("sculpture", sculptureJson(definition));

  const reference = definition.designSurface;
  if (!reference) return formData;

  const bytes = availableAssets.get(reference.source);
  if (!bytes) return formData;
  verifyProjectAssetBytes(reference, bytes, "Design surface");
  formData.set(
    "designSurface",
    new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" }),
    reference.source.split("/").at(-1) ?? "design-surface.glb",
  );
  return formData;
}
