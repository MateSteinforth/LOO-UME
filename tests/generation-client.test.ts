import { describe, expect, it } from "vitest";
import {
  GenerationClient,
  type GenerationWorkerLike,
} from "../web/src/GenerationClient.ts";
import type { GenerationWorkerMessage } from "../web/src/GenerationWorkerProtocol.ts";

class FakeWorker implements GenerationWorkerLike {
  onmessage: ((event: MessageEvent<GenerationWorkerMessage>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: unknown[] = [];
  terminated = false;
  postError: Error | undefined;

  postMessage(message: unknown): void {
    if (this.postError) throw this.postError;
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(message: GenerationWorkerMessage): void {
    this.onmessage?.({
      data: message,
    } as MessageEvent<GenerationWorkerMessage>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const input = {
  definition: {} as never,
  projectSource: "test:project",
  panelProfile: {} as never,
};

describe("GenerationClient", () => {
  it("resolves a worker result and terminates its worker", async () => {
    const worker = new FakeWorker();
    const client = new GenerationClient(() => worker);
    const generated = client.generatePlanar(input);

    expect(worker.requests).toHaveLength(1);
    worker.respond({
      id: 1,
      ok: true,
      kind: "planar",
      result: {
        definition: {} as never,
        files: [
          {
            source: "mechanics/part.stl",
            bytes: new Uint8Array([1, 2, 3]),
            sha256: "a",
          },
        ],
      },
    });

    await expect(generated).resolves.toMatchObject({
      files: [
        { source: "mechanics/part.stl", bytes: new Uint8Array([1, 2, 3]) },
      ],
    });
    expect(worker.terminated).toBe(true);
  });

  it("returns classified worker errors and releases the request", async () => {
    const worker = new FakeWorker();
    const client = new GenerationClient(() => worker);
    const generated = client.generatePlanar(input);

    worker.respond({
      id: 1,
      ok: false,
      kind: "planar",
      error: {
        kind: "geometry",
        name: "PanelBoundaryGenerationError",
        message: "Boundary is open.",
        code: "open-boundary",
      },
    });

    await expect(generated).rejects.toMatchObject({
      kind: "geometry",
      code: "open-boundary",
      message: "Boundary is open.",
    });
    expect(worker.terminated).toBe(true);
  });

  it("keeps Manifold runtime failures separate from geometry failures", async () => {
    const worker = new FakeWorker();
    const client = new GenerationClient(() => worker);
    const generated = client.generatePlanar(input);

    worker.respond({
      id: 1,
      ok: false,
      kind: "planar",
      error: {
        kind: "manifold-runtime",
        name: "ManifoldRuntimeUnavailableError",
        message: "Manifold WASM could not be loaded.",
      },
    });

    await expect(generated).rejects.toMatchObject({ kind: "manifold-runtime" });
  });

  it("rejects a concurrent request without replacing active work", async () => {
    const worker = new FakeWorker();
    const client = new GenerationClient(() => worker);
    const active = client.generatePlanar(input);

    await expect(client.generatePlanar(input)).rejects.toThrow(
      "already running",
    );
    expect(worker.terminated).toBe(false);
    worker.respond({
      id: 1,
      ok: true,
      kind: "planar",
      result: { definition: {} as never, files: [] },
    });
    await expect(active).resolves.toMatchObject({ files: [] });
  });

  it("recovers after worker construction, post-message, and worker errors", async () => {
    const postFailure = new FakeWorker();
    postFailure.postError = new Error("post failed");
    const workerError = new FakeWorker();
    const recoveredWorker = new FakeWorker();
    const workers = [postFailure, workerError, recoveredWorker];
    let calls = 0;
    const client = new GenerationClient(() => {
      calls += 1;
      if (calls === 1) throw new Error("worker construction failed");
      return workers[calls - 2]!;
    });

    await expect(client.generatePlanar(input)).rejects.toThrow(
      "construction failed",
    );
    await expect(client.generatePlanar(input)).rejects.toThrow("post failed");
    expect(postFailure.terminated).toBe(true);
    const failed = client.generatePlanar(input);
    workerError.fail("worker crashed");
    await expect(failed).rejects.toMatchObject({
      kind: "worker-runtime",
      message: "worker crashed",
    });
    expect(workerError.terminated).toBe(true);
    const recovered = client.generatePlanar(input);
    recoveredWorker.respond({
      id: 3,
      ok: true,
      kind: "planar",
      result: { definition: {} as never, files: [] },
    });
    await expect(recovered).resolves.toMatchObject({ files: [] });

    const retryWorker = new FakeWorker();
    const retryClient = new GenerationClient(() => retryWorker);
    const source = new Uint8Array([4, 5, 6]);
    const retried = retryClient.generateStructural({
      ...input,
      designSurfaceBytes: source,
    });
    expect(source).toEqual(new Uint8Array([4, 5, 6]));
    const request = retryWorker.requests[0] as {
      designSurfaceBytes?: Uint8Array;
    };
    expect(request.designSurfaceBytes).toEqual(source);
    expect(request.designSurfaceBytes).not.toBe(source);
    retryWorker.respond({
      id: 1,
      ok: true,
      kind: "structural",
      result: {
        analysis: {} as never,
        definition: {} as never,
        generatedStructure: {} as never,
        bundle: {} as never,
      },
    });
    await expect(retried).resolves.toBeDefined();
  });

  it("rejects active and later requests after disposal", async () => {
    const worker = new FakeWorker();
    const client = new GenerationClient(() => worker);
    const generated = client.generatePlanar(input);

    client.dispose();

    await expect(generated).rejects.toThrow("disposed");
    await expect(client.generatePlanar(input)).rejects.toThrow("disposed");
    expect(worker.terminated).toBe(true);
  });
});
