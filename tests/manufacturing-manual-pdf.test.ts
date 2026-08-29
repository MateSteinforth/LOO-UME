import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createManufacturingManualPdf } from "../web/src/ManufacturingManualPdf.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";
import { createWiringAssemblyManualModel } from "../web/src/WiringAssemblyManual.ts";

describe("manufacturing manual PDF", () => {
  it("lists every flagship panel and every current data connection", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
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
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      project.source,
    );
    const first = createManufacturingManualPdf(model);
    const second = createManufacturingManualPdf(model);
    const pdf = new TextDecoder().decode(first);

    expect(first).toEqual(second);
    expect(pdf.startsWith("%PDF-1.7\n%LOOUME-MANUFACTURING-MANUAL"))
      .toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595 842]");
    expect(pdf).toContain("/PrintScaling /None");
    expect(pdf).toContain("/Count 5");
    expect((pdf.match(/    IN:/g) ?? [])).toHaveLength(41);
    expect((pdf.match(/    OUT:/g) ?? [])).toHaveLength(41);
    for (const panel of project.sculpture.panels) {
      expect(pdf).toContain(panel.id);
    }
    expect(pdf).toMatch(/startxref\n\d+\n%%EOF\n$/);
  });

  it("paginates valid projects with many outputs and long identifiers", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
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
    const base = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      project.source,
    );
    const samplePanel = base.outputs[0]!.panels[0]!;
    const longId = `LONG-${"X".repeat(2_000)}`;
    const model = {
      ...base,
      outputs: Array.from({ length: 40 }, (_, outputIndex) => {
        const id = outputIndex === 39 ? longId : `P-${outputIndex + 1}`;
        const physicalStart = outputIndex * 64;
        return {
          ...base.outputs[0]!,
          outputIndex,
          label: outputIndex === 39 ? `Long ${"label ".repeat(80)}` : `Output ${outputIndex + 1}`,
          gpio: 16 + outputIndex,
          physicalStart,
          physicalEnd: physicalStart + 63,
          panels: [{
            ...samplePanel,
            id,
            physicalStart,
            physicalEnd: physicalStart + 63,
            dataIn: `Controller GPIO ${16 + outputIndex}`,
            dataOut: `End of Output ${outputIndex + 1}`,
          }],
        };
      }),
    };
    const pdf = new TextDecoder().decode(createManufacturingManualPdf(model));
    const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1]);

    expect(pageCount).toBeGreaterThan(42);
    expect(pdf).toContain("LOO/UME MANUFACTURING MANUAL \\(continued\\)");
    expect(pdf).toContain("OUTPUT 40 \\(continued\\)");
    expect((pdf.match(/    IN:/g) ?? [])).toHaveLength(40);
    expect((pdf.match(/    OUT:/g) ?? [])).toHaveLength(40);
    expect(pdf).toContain("LONG-");
    expect(pdf).toMatch(/startxref\n\d+\n%%EOF\n$/);
  });
});
