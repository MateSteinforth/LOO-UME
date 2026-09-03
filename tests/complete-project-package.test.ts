import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createCompleteProjectPackageFiles,
  createCompleteProjectPackageZip,
  type CompleteProjectPackageManifest,
} from "../web/src/CompleteProjectPackage.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { readProjectPackageSummary } from "../web/src/ProjectPackage.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function fixture(source: string) {
  const project = await loadPanelAssemblyProjectFromFile(source);
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  const contract = createHardwareMappingContract(
    mapping,
    wiring,
    project.panelProfile,
  );
  return { project, wiring, contract };
}

describe("complete project package", () => {
  it("contains every current flagship handoff in one deterministic ZIP", async () => {
    const { project, wiring, contract } = await fixture(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    const artifacts = {
      assemblyManualHtml: "<!doctype html><title>Assembly</title>",
      manufacturingManualPdf: new TextEncoder().encode("%PDF manufacturing"),
      hardwareContract: contract,
      wiringReview: { status: wiring.status, fingerprint: contract.fingerprint },
    };
    const first = createCompleteProjectPackageZip(
      project.sculpture,
      new Map(),
      artifacts,
    );
    const second = createCompleteProjectPackageZip(
      project.sculpture,
      new Map(),
      artifacts,
    );
    expect(first).toEqual(second);
    expect(readProjectPackageSummary(first).manifest.id).toBe(project.sculpture.id);

    const entries = unzipSync(first);
    const root = `${project.sculpture.id}/`;
    for (const path of [
      "sculpture.json",
      "manifest.json",
      "package-manifest.json",
      "assembly-manual.html",
      "mapping/hardware-contract.json",
      "wled/deployment-manifest.json",
      "madmapper/fixtures.svg",
      "madmapper/manifest.json",
      "touchdesigner/config.json",
      "touchdesigner/loo_ume_ddp.py",
      "touchdesigner/README.txt",
      "fabrication/panel-labels-herma-4385.pdf",
      "fabrication/manufacturing-manual.pdf",
    ]) expect(entries[`${root}${path}`]).toBeDefined();

    const manifest = JSON.parse(new TextDecoder().decode(
      entries[`${root}package-manifest.json`],
    )) as CompleteProjectPackageManifest;
    expect(manifest).toMatchObject({
      mappingFingerprint: "524500f5",
      pixelCount: 2_624,
      artifacts: {
        editableProject: { status: "included" },
        mapping: { status: "included" },
        wled: { status: "included", mode: "installation" },
        madMapper: { status: "included" },
        touchDesigner: { status: "included" },
      },
    });
    const touchDesignerConfig = JSON.parse(new TextDecoder().decode(
      entries[`${root}touchdesigner/config.json`],
    ));
    expect(touchDesignerConfig.deploymentIdentity).toBe(
      manifest.artifacts.wled.deploymentIdentity,
    );
    expect(touchDesignerConfig.mappingFingerprint).toBe(
      manifest.mappingFingerprint,
    );
    expect(touchDesignerConfig.sculptureMirror.wledLedmapApplications).toBe(1);
    for (const file of manifest.files) {
      const bytes = entries[`${root}${file.path}`]!;
      expect(bytes.byteLength).toBe(file.byteLength);
      expect(sha256Bytes(bytes)).toBe(file.sha256);
    }
  });

  it("records unavailable optional output without blocking project files", async () => {
    const { project, wiring, contract } = await fixture(
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const files = createCompleteProjectPackageFiles(
      project.sculpture,
      new Map(),
      {
        assemblyManualHtml: "<!doctype html><title>Assembly</title>",
        manufacturingManualPdf: new TextEncoder().encode("%PDF manufacturing"),
        hardwareContract: contract,
        wiringReview: { status: wiring.status },
      },
    );
    const manifest = JSON.parse(new TextDecoder().decode(
      files.get("package-manifest.json"),
    )) as CompleteProjectPackageManifest;

    expect(files.has("sculpture.json")).toBe(true);
    expect(files.has("fabrication/panel-labels-herma-4385.pdf")).toBe(true);
    expect(manifest.artifacts.fabrication.status).toBe("included");
    expect(manifest.artifacts.wled).toMatchObject({
      status: "included",
      mode: "diagnostic",
    });
    expect(manifest.artifacts.madMapper.status).toBe("unavailable");
    expect(manifest.artifacts.madMapper.reason).toMatch(/mapping-ready/);
    expect(manifest.artifacts.touchDesigner.status).toBe("included");
    expect(files.has("touchdesigner/config.json")).toBe(true);
    const touchDesignerConfig = JSON.parse(new TextDecoder().decode(
      files.get("touchdesigner/config.json"),
    ));
    expect(touchDesignerConfig).toMatchObject({
      deploymentIdentity: null,
      sculptureMirror: { status: "simulator-only" },
    });
  });
});
