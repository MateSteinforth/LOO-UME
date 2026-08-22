import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import { createWledDeploymentBundle } from "../src/wled/DeploymentContract.ts";
import {
  createAssemblyPackageFiles,
  createAssemblyPackageZip,
} from "../web/src/AssemblyPackage.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

describe("assembly package", () => {
  it("combines the project, referenced GLB, and operator artifacts", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const definition = structuredClone(project.sculpture);
    const glb = new Uint8Array([
      0x67, 0x6c, 0x54, 0x46,
      0x02, 0x00, 0x00, 0x00,
      0x0c, 0x00, 0x00, 0x00,
    ]);
    definition.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/placement-surface.glb",
      sha256: sha256Bytes(glb),
      scaleToMillimeters: 1000,
      status: "watertight",
    };
    const boundary = new TextEncoder().encode("solid boundary\nendsolid boundary\n");
    const part = new TextEncoder().encode("solid part-001\nendsolid part-001\n");
    definition.generatedMechanics = {
      generator: { id: "assembly-package-test", version: "1" },
      sourceFingerprint: { algorithm: "sha256", value: "a".repeat(64) },
      status: { generation: "complete", validation: "passed" },
      boundary: {
        kind: "closed-boundary-mesh",
        format: "stl",
        source: "mechanics/boundary.stl",
        sha256: sha256Bytes(boundary),
      },
      parts: [{
        id: "part-001",
        format: "stl",
        source: "mechanics/parts/part-001.stl",
        sha256: sha256Bytes(part),
      }],
    };
    const assets = new Map([
      [definition.designSurface.source, glb],
      [definition.generatedMechanics.boundary.source, boundary],
      [definition.generatedMechanics.parts[0]!.source, part],
    ]);
    const geometry = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      geometry,
      definition,
      project.panelProfile,
    );
    const hardwareContract = createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    );
    const artifacts = {
      assemblyManualHtml: "<!doctype html><title>Assembly</title>",
      hardwareContract,
      wiringReview: { status: "draft" },
    };
    const files = createAssemblyPackageFiles(definition, assets, artifacts);
    expect([...files.keys()]).toEqual([
      "sculpture.json",
      "design/placement-surface.glb",
      "mechanics/boundary.stl",
      "mechanics/parts/part-001.stl",
      "assembly-manual.html",
      "wled/diagnostic/wiring-review.diagnostic.json",
      "wled/diagnostic/ledmap.diagnostic.json",
      "wled/diagnostic/route-mapping.diagnostic.json",
      "wled/diagnostic/deployment-manifest.diagnostic.json",
    ]);
    expect(files.get("design/placement-surface.glb")).toEqual(glb);
    expect(files.get("mechanics/boundary.stl")).toEqual(boundary);
    expect(files.get("mechanics/parts/part-001.stl")).toEqual(part);
    const expectedDeployment = createWledDeploymentBundle(
      hardwareContract,
      sculptureJson(definition),
      "diagnostic",
    );
    for (const [path, bytes] of expectedDeployment.files) {
      expect(new TextDecoder().decode(files.get(path))).toBe(bytes);
    }

    const entries = unzipSync(createAssemblyPackageZip(
      definition,
      assets,
      artifacts,
      "assembly",
    ));
    expect(Object.keys(entries).sort()).toEqual([
      "assembly/assembly-manual.html",
      "assembly/design/placement-surface.glb",
      "assembly/mechanics/boundary.stl",
      "assembly/mechanics/parts/part-001.stl",
      "assembly/sculpture.json",
      "assembly/wled/diagnostic/deployment-manifest.diagnostic.json",
      "assembly/wled/diagnostic/ledmap.diagnostic.json",
      "assembly/wled/diagnostic/route-mapping.diagnostic.json",
      "assembly/wled/diagnostic/wiring-review.diagnostic.json",
    ]);
  });

  it("embeds the same installation bytes as the shared CLI policy", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    const geometry = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      geometry,
      project.sculpture,
      project.panelProfile,
    );
    const hardwareContract = createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    );
    const files = createAssemblyPackageFiles(project.sculpture, new Map(), {
      assemblyManualHtml: "<!doctype html><title>Assembly</title>",
      hardwareContract,
      wiringReview: { status: wiring.status },
    });
    const expected = createWledDeploymentBundle(
      hardwareContract,
      sculptureJson(project.sculpture),
      "installation",
    );
    expect(hardwareContract.readiness.mappingReady).toBe(true);
    expect(files.has("wiring-review.json")).toBe(true);
    expect([...files.keys()].some((path) => path.includes("diagnostic")))
      .toBe(false);
    for (const [path, bytes] of expected.files) {
      expect(new TextDecoder().decode(files.get(path))).toBe(bytes);
    }
  });
});
