import { compilePanelBoundaryBundle } from "../../src/cad/CompilePanelBoundaryBundle.ts";
import { ManifoldRuntimeUnavailableError } from "../../src/cad/ManifoldRuntime.ts";
import { createPanelAssemblyProject } from "../../src/sculpture/PanelAssembly.ts";
import { PanelBoundaryGenerationError } from "../../src/sculpture/PanelOutlineBoundary.ts";
import { runStructuralPipeline } from "../../src/structure/StructuralPipeline.ts";
import type {
  GenerationFailure,
  GenerationRequest,
  GenerationSuccess,
  PlanarGenerationResult,
  StructuralGenerationResult,
} from "./GenerationWorkerProtocol.ts";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<GenerationRequest>) => void,
  ): void;
  postMessage(
    message: GenerationSuccess | GenerationFailure,
    transfer: Transferable[],
  ): void;
}

const workerScope = self as unknown as WorkerScope;

function transferBuffers(
  value: unknown,
  buffers: Transferable[] = [],
  seen = new Set<ArrayBufferLike>(),
): Transferable[] {
  if (value instanceof Uint8Array) {
    if (!seen.has(value.buffer)) {
      seen.add(value.buffer);
      buffers.push(value.buffer as ArrayBuffer);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => transferBuffers(item, buffers, seen));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) =>
      transferBuffers(item, buffers, seen),
    );
  }
  return buffers;
}

function failure(
  request: GenerationRequest,
  error: unknown,
): GenerationFailure {
  if (error instanceof ManifoldRuntimeUnavailableError) {
    return {
      id: request.id,
      ok: false,
      kind: request.kind,
      error: {
        kind: "manifold-runtime",
        name: error.name,
        message: error.message,
      },
    };
  }
  if (error instanceof PanelBoundaryGenerationError) {
    return {
      id: request.id,
      ok: false,
      kind: request.kind,
      error: {
        kind: "geometry",
        name: error.name,
        message: error.message,
        code: error.code,
      },
    };
  }
  const detail = error instanceof Error ? error : new Error(String(error));
  return {
    id: request.id,
    ok: false,
    kind: request.kind,
    error: {
      kind: "generation",
      name: detail.name,
      message: detail.message,
    },
  };
}

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    try {
      const project = createPanelAssemblyProject(
        request.definition,
        request.projectSource,
        request.panelProfile,
      );
      let completed: PlanarGenerationResult | StructuralGenerationResult;
      if (request.kind === "planar") {
        const { definition, files } = await compilePanelBoundaryBundle(
          project,
          request.panelProfileSource,
        );
        completed = { definition, files };
      } else {
        const { analysis, definition, generatedStructure, bundle } =
          await runStructuralPipeline(
            project,
            request.designSurfaceBytes
              ? { designSurfaceBytes: request.designSurfaceBytes }
              : {},
          );
        completed = { analysis, definition, generatedStructure, bundle };
      }
      const response: GenerationSuccess = {
        id: request.id,
        ok: true,
        kind: request.kind,
        result: completed,
      };
      workerScope.postMessage(response, transferBuffers(completed));
    } catch (error) {
      workerScope.postMessage(failure(request, error), []);
    }
  })();
});
