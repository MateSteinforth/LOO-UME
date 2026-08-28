import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createMadMapperPackageFiles,
  createMadMapperPackageZip,
} from "../web/src/MadMapperPackage.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function flagshipContract() {
  const project = await loadPanelAssemblyProjectFromFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    process.cwd(),
  );
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  return createHardwareMappingContract(mapping, wiring, project.panelProfile);
}

describe("MadMapper package", () => {
  it("contains the fixture, patch, manifest, and valid settings PDF", async () => {
    const contract = await flagshipContract();
    const files = createMadMapperPackageFiles(contract, "rhombicosidodecahedron");
    expect([...files.keys()]).toEqual([
      "fixtures.svg",
      "patch.csv",
      "manifest.json",
      "SETUP.pdf",
    ]);
    const pdf = new TextDecoder().decode(files.get("SETUP.pdf"));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("DRAFT - ART-NET HARDWARE SETTINGS REQUIRE LIVE-010 VALIDATION");
    expect(pdf).toContain("File > Import Fixtures");
    expect(pdf).toContain("Avoid Cross Universe Pixels");
    expect(pdf).toMatch(/startxref\n\d+\n%%EOF\n$/);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
    expect(manifest).toMatchObject({
      mappingFingerprint: "73b36d49",
      panelFixtureCount: 41,
      pixelFixtureCount: 2_624,
      pixelCount: 2_624,
      universeCount: 16,
    });
  });

  it("creates deterministic ZIP bytes under one sculpture folder", async () => {
    const contract = await flagshipContract();
    const first = createMadMapperPackageZip(contract, "Rhombicosidodecahedron");
    const second = createMadMapperPackageZip(contract, "Rhombicosidodecahedron");
    expect(first).toEqual(second);
    expect(Object.keys(unzipSync(first)).sort()).toEqual([
      "rhombicosidodecahedron-madmapper/SETUP.pdf",
      "rhombicosidodecahedron-madmapper/fixtures.svg",
      "rhombicosidodecahedron-madmapper/manifest.json",
      "rhombicosidodecahedron-madmapper/patch.csv",
    ]);
  });

  it("blocks package creation when the mapping is not ready", async () => {
    const contract = await flagshipContract();
    const blocked = structuredClone(contract);
    blocked.readiness.mappingReady = false;
    expect(() => createMadMapperPackageZip(blocked, "blocked")).toThrow(
      "requires a mapping-ready authored route",
    );
  });
});
