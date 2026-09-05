import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type {
  GenerationKind,
  GenerationRequest,
  GenerationWorkerMessage,
  PlanarGenerationResult,
  StructuralGenerationResult,
} from "./GenerationWorkerProtocol.ts";

export class GenerationWorkerError extends Error {
  constructor(
    readonly kind:
      "manifold-runtime" | "worker-runtime" | "geometry" | "generation",
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GenerationWorkerError";
  }
}

export interface GenerationWorkerLike {
  onmessage: ((event: MessageEvent<GenerationWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: GenerationRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export type GenerationWorkerFactory = () => GenerationWorkerLike;

export interface GenerationInput {
  definition: PanelAssemblyDefinition;
  projectSource: string;
  panelProfile: PanelHardwareProfile;
  panelProfileSource?: string;
  designSurfaceBytes?: Uint8Array;
}

export class GenerationClient {
  private active = false;
  private disposed = false;
  private nextId = 1;
  private activeWorker: GenerationWorkerLike | undefined;
  private rejectActive: ((error: Error) => void) | undefined;

  constructor(
    private readonly createWorker: GenerationWorkerFactory = () =>
      new Worker(new URL("./GenerationWorker.ts", import.meta.url), {
        type: "module",
      }),
  ) {}

  generatePlanar(input: GenerationInput): Promise<PlanarGenerationResult> {
    return this.generate("planar", input) as Promise<PlanarGenerationResult>;
  }

  generateStructural(
    input: GenerationInput,
  ): Promise<StructuralGenerationResult> {
    return this.generate(
      "structural",
      input,
    ) as Promise<StructuralGenerationResult>;
  }

  dispose(): void {
    this.disposed = true;
    this.activeWorker?.terminate();
    this.activeWorker = undefined;
    this.rejectActive?.(new Error("Generation client is disposed."));
    this.rejectActive = undefined;
    this.active = false;
  }

  private generate(
    kind: GenerationKind,
    input: GenerationInput,
  ): Promise<PlanarGenerationResult | StructuralGenerationResult> {
    if (this.disposed)
      return Promise.reject(new Error("Generation client is disposed."));
    if (this.active)
      return Promise.reject(new Error("Generation is already running."));
    let worker: GenerationWorkerLike;
    try {
      worker = this.createWorker();
    } catch (error) {
      return Promise.reject(
        new GenerationWorkerError(
          "worker-runtime",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
    const designSurfaceBytes = input.designSurfaceBytes?.slice();
    const request: GenerationRequest = {
      id: this.nextId++,
      kind,
      ...input,
      ...(designSurfaceBytes ? { designSurfaceBytes } : {}),
    };
    this.active = true;
    this.activeWorker = worker;
    const transfer = designSurfaceBytes
      ? [designSurfaceBytes.buffer as ArrayBuffer]
      : [];
    return new Promise((resolve, reject) => {
      const finish = (): void => {
        this.active = false;
        this.activeWorker = undefined;
        this.rejectActive = undefined;
        worker.terminate();
      };
      worker.onmessage = ({ data }) => {
        if (data.id !== request.id || data.kind !== kind) return;
        finish();
        if (data.ok) resolve(data.result);
        else
          reject(
            new GenerationWorkerError(
              data.error.kind,
              data.error.message,
              data.error.code,
            ),
          );
      };
      worker.onerror = (event) => {
        finish();
        reject(
          new GenerationWorkerError(
            "worker-runtime",
            event.message || "Generation worker failed.",
          ),
        );
      };
      this.rejectActive = (error) => reject(error);
      try {
        worker.postMessage(request, transfer);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }
}
