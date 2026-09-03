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
      "artnet-unicast-loopback.csv",
      "patch.csv",
      "manifest.json",
      "SETUP.pdf",
    ]);
    const pdf = new TextDecoder().decode(files.get("SETUP.pdf"));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("DRAFT - SCULPTURE OUTPUT REQUIRES LIVE-020 VALIDATION");
    expect(pdf).toContain("File > Import Fixtures");
    expect(pdf).toContain("Avoid Cross Universe Pixels");
    expect(pdf).toContain("Import artnet-unicast-loopback.csv");
    expect(pdf).toContain("Do not send MadMapper Art-Net directly to WLED");
    expect(pdf).toMatch(/startxref\n\d+\n%%EOF\n$/);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
    expect(manifest).toMatchObject({
      schemaVersion: "1.2.0",
      mappingFingerprint: "524500f5",
      panelFixtureCount: 41,
      pixelFixtureCount: 2_624,
      pixelCount: 2_624,
      universeCount: 16,
      plannedLiveOutput: {
        transport: "LOO/UME-WLAN-DDP",
      },
    });
  });

  it("creates an importable loopback route for every exported universe", async () => {
    const contract = await flagshipContract();
    const files = createMadMapperPackageFiles(contract, "rhombicosidodecahedron");
    const unicastRouting = new TextDecoder()
      .decode(files.get("artnet-unicast-loopback.csv"))
      .trimEnd()
      .split("\n");
    expect(unicastRouting).toHaveLength(17);
    expect(unicastRouting[0]).toBe(
      "IP,Short Name,Universe,Active (0 or 1),Long Name,Remapped (0 or 1),Remapped Universe,Was Autodetected (via polling - 0 or 1)",
    );
    expect(unicastRouting.slice(1)).toEqual(
      Array.from(
        { length: 16 },
        (_, index) =>
          `127.0.0.1,LOO-UME,${index + 1},1,LOO-UME MadMapper preview,0,0,0`,
      ),
    );
  });

  it("creates deterministic ZIP bytes under one sculpture folder", async () => {
    const contract = await flagshipContract();
    const first = createMadMapperPackageZip(contract, "Rhombicosidodecahedron");
    const second = createMadMapperPackageZip(contract, "Rhombicosidodecahedron");
    expect(first).toEqual(second);
    expect(Object.keys(unzipSync(first)).sort()).toEqual([
      "rhombicosidodecahedron-madmapper/SETUP.pdf",
      "rhombicosidodecahedron-madmapper/artnet-unicast-loopback.csv",
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
