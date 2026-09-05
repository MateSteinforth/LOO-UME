import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type { StructuralPipelineResult } from "../../src/structure/StructuralPipeline.ts";
import type { CompiledPanelBoundaryBundle } from "../../src/cad/CompilePanelBoundaryBundle.ts";

export type GenerationKind = "planar" | "structural";

/** Browser integration needs generated assets, not compiler-only mesh details. */
export type PlanarGenerationResult = Pick<
  CompiledPanelBoundaryBundle,
  "definition" | "files"
>;
export type StructuralGenerationResult = Pick<
  StructuralPipelineResult,
  "analysis" | "definition" | "generatedStructure" | "bundle"
>;

export interface GenerationRequest {
  id: number;
  kind: GenerationKind;
  definition: PanelAssemblyDefinition;
  projectSource: string;
  panelProfile: PanelHardwareProfile;
  panelProfileSource?: string;
  designSurfaceBytes?: Uint8Array;
}

export interface GenerationSuccess {
  id: number;
  ok: true;
  kind: GenerationKind;
  result: PlanarGenerationResult | StructuralGenerationResult;
}

export interface GenerationFailure {
  id: number;
  ok: false;
  kind: GenerationKind;
  error: {
    kind: "manifold-runtime" | "geometry" | "generation";
    message: string;
    name: string;
    code?: string;
  };
}

export type GenerationWorkerMessage = GenerationSuccess | GenerationFailure;
