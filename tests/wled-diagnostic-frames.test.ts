import { describe, expect, it, vi } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import {
  createWledDiagnosticPlan,
  sendWledDiagnosticRequest,
  WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES,
} from "../src/wled/DiagnosticFrames.ts";
import { createWledDeploymentBundle } from "../src/wled/DeploymentContract.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function planFixture() {
  const project = await loadPanelAssemblyProjectFromFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    process.cwd(),
  );
  const geometry = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    geometry,
    project.sculpture,
    project.panelProfile,
  );
  const contract = createHardwareMappingContract(
    geometry,
    wiring,
    project.panelProfile,
  );
  const deployment = createWledDeploymentBundle(
    contract,
    sculptureJson(project.sculpture),
    "installation",
  );
  return createWledDiagnosticPlan(contract, deployment.deploymentIdentity);
}

describe("deterministic WLED hardware diagnostics", () => {
  it("binds every address and RGB channel to all mapping identities", async () => {
    const first = await planFixture();
    const second = await planFixture();

    expect(first.planFingerprint).toBe(second.planFingerprint);
    expect(first.frames).toHaveLength(2_624 * 3);
    expect(first.mappingFingerprint).toBe("524500f5");
    expect(first.mappingFingerprintVersion).toBe("fnv1a32-u32le-v2");
    expect(new Set(first.frames.map((frame) => frame.sequence)).size)
      .toBe(first.frames.length);
    expect(new Set(first.frames.map((frame) =>
      `${frame.logicalIndex}:${frame.rgbChannel}`
    )).size).toBe(first.frames.length);
    expect(new Set(first.frames.map((frame) => frame.outputIndex))).toEqual(
      new Set([0, 1, 2, 3]),
    );
    expect(new Set(first.frames.map((frame) => frame.panelId)).size).toBe(41);
    expect(new Set(first.frames.map((frame) =>
      `${frame.panelPixelX}:${frame.panelPixelY}`
    )).size).toBe(64);
    expect(first.frames.every((frame) =>
      new TextEncoder().encode(frame.requestBytes).byteLength <=
        WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES
    )).toBe(true);
    expect(first.frames[0]).toMatchObject({
      sequence: 0,
      outputIndex: 3,
      gpio: 19,
      logicalIndex: 0,
      rgbChannel: "red",
    });
    expect(JSON.parse(first.frames[0]!.requestBytes)).toMatchObject({
      on: true,
      bri: 32,
      tt: 0,
      seg: { id: 0, start: 0, stop: 2_624, fx: 0 },
    });
  });

  it("retries transient responses and keeps the request bytes exact", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const retryDelay = vi.fn(async () => {});
    const requestBytes = '{"on":true}';

    await sendWledDiagnosticRequest(requestBytes, {
      baseUrl: "http://wled.local/device",
      fetcher,
      retryDelay,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]![0])).toBe("http://wled.local/json/state");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      body: requestBytes,
    });
    expect(retryDelay).toHaveBeenCalledOnce();
  });

  it("does not retry permanent failures and rejects oversized input before fetch", async () => {
    const permanent = vi.fn(async () => new Response(null, { status: 400 }));
    await expect(sendWledDiagnosticRequest('{"on":true}', {
      baseUrl: "http://wled.local",
      fetcher: permanent,
      retryDelay: async () => {},
    })).rejects.toThrow("HTTP 400");
    expect(permanent).toHaveBeenCalledOnce();

    const unused = vi.fn();
    await expect(sendWledDiagnosticRequest("x".repeat(1_025), {
      baseUrl: "http://wled.local",
      fetcher: unused,
    })).rejects.toThrow("1025 bytes; limit is 1024");
    expect(unused).not.toHaveBeenCalled();
  });
});
