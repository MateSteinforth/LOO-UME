import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";
import {
  createWiringAssemblyManualModel,
  renderStandaloneWiringAssemblyManualDocument,
  renderWiringAssemblyManualHtml,
} from "../web/src/WiringAssemblyManual.ts";

async function fixture() {
  const source = "sculptures/rhombicosidodecahedron/sculpture.json";
  const project = await loadPanelAssemblyProjectFromFile(source, process.cwd());
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
  return { source, project, contract };
}

async function draftFixture() {
  const source = "sculptures/panel-outline-prism/sculpture.json";
  const project = await loadPanelAssemblyProjectFromFile(source, process.cwd());
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
  return { source, project, contract };
}

describe("printable wiring assembly manual", () => {
  it("joins the exact flagship poses, routes, orientations, and address ranges", async () => {
    const { source, project, contract } = await fixture();
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      source,
    );

    expect(model).toMatchObject({
      routeRevision: 3,
      wiringStatus: "authored",
      routeSource: "authored-route",
      mappingReady: true,
      mappingFingerprint: "ca60c1b1",
      optimizationFingerprint: "3cde5fa90c4ae17a",
      totalPixels: 2_624,
      colorOrder: "GRB",
      pixelOrder: "8 × 8 straight rows",
    });
    expect(model.outputs.map((output) => output.gpio)).toEqual([16, 17, 18, 19]);
    expect(model.outputs.map((output) => output.color)).toEqual([
      "#36e0d0", "#ff9d5c", "#a78bfa", "#f472b6",
    ]);
    expect(model.outputs.map((output) => output.panels.length)).toEqual([11, 10, 10, 10]);
    expect(model.outputs.map((output) => [output.physicalStart, output.physicalEnd]))
      .toEqual([[0, 703], [704, 1_343], [1_344, 1_983], [1_984, 2_623]]);
    expect(model.outputs[0]!.panels.map((panel) => panel.id)).toEqual([
      "SQ-04", "PC-04", "SQ-08", "PC-03", "SQ-16", "SQ-23",
      "SQ-28", "PC-08", "SQ-24", "SQ-18", "SQ-17",
    ]);
    expect(model.outputs[0]!.panels[0]).toMatchObject({
      physicalStart: 0,
      physicalEnd: 63,
      dataIn: "Controller GPIO 16",
      dataOut: "PC-04 DIN",
      turnDegrees: 0,
      mirrored: false,
      dinCorner: "top-left",
      doutCorner: "bottom-right",
    });
    const physicalQuarterTurns = model.outputs[0]!.panels[0]!.turnDegrees / 90;
    let dinCoordinate = { x: 0, y: 0 };
    for (let turn = 0; turn < physicalQuarterTurns; turn += 1) {
      dinCoordinate = { x: 7 - dinCoordinate.y, y: dinCoordinate.x };
    }
    expect(dinCoordinate).toEqual({ x: 0, y: 0 });
    for (const panel of model.outputs.flatMap((output) => output.panels)) {
      const sourcePanel = project.sculpture.panels.find(
        (candidate) => candidate.id === panel.id,
      )!;
      expect(panel.turnDegrees).toBe(
        ((4 - sourcePanel.installedAddressTransform!.quarterTurnsClockwise) % 4) * 90,
      );
    }
    const panelIds = model.outputs.flatMap((output) =>
      output.panels.map((panel) => panel.id),
    );
    expect(panelIds).toHaveLength(41);
    expect(new Set(panelIds).size).toBe(41);
  });

  it("uses a draft suggestion, unassigned GPIO, and assumed turns", async () => {
    const { source, project, contract } = await draftFixture();
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      source,
    );

    expect(model).toMatchObject({
      wiringStatus: "draft",
      routeSource: "draft-suggestion",
      mappingReady: false,
      optimizationFingerprint: null,
      totalPixels: 256,
    });
    expect(model.outputs).toHaveLength(1);
    expect(model.outputs[0]!.gpio).toBeNull();
    expect(model.outputs[0]!.panels).toHaveLength(4);
    expect(model.outputs[0]!.panels[0]!.dataIn).toBe(
      "Controller output (GPIO unassigned)",
    );
    const html = renderWiringAssemblyManualHtml(model);
    expect(html).toContain("DRAFT SUGGESTION");
    expect(html).toContain("GPIO unassigned");
    expect(html).toContain("Not route-optimized; current assumed turns are shown");
    expect(html).not.toContain("MAPPING READY");
  });

  it("refuses mirrored assembly instructions", async () => {
    const { source, project, contract } = await fixture();
    const mirroredContract = structuredClone(contract);
    mirroredContract.mapping.panels[0]!.installedAddressTransform.mirrored = true;
    expect(() => createWiringAssemblyManualModel(
      project.sculpture,
      mirroredContract,
      project.panelProfile,
      source,
    )).toThrow(/does not support mirrored/);
  });

  it("renders six printable sheets with every panel and three placement views", async () => {
    const { source, project, contract } = await fixture();
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      `${source}<unsafe>`,
    );
    const html = renderWiringAssemblyManualHtml(model);

    expect(html.match(/<section class="sheet/g)).toHaveLength(6);
    expect(html.match(/class="projection-card"/g)).toHaveLength(3);
    expect(html.match(/class="orientation-diagram"/g)).toHaveLength(41);
    expect(html).toContain('class="route-arrows"');
    expect(html).toContain('marker-end="url(#arrow-right-');
    expect(html).toContain("GPIO 16");
    expect(html).toContain("SQ-04 → SQ-17");
    expect(html).toContain("sculpture.json&lt;unsafe&gt;");
    expect(html).not.toContain("sculpture.json<unsafe>");
    for (const output of model.outputs) {
      for (const panel of output.panels) expect(html).toContain(panel.id);
    }
  });

  it("paginates an arbitrary long output using the current output metadata", async () => {
    const { source, project, contract } = await fixture();
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      source,
    );
    const panels = model.outputs.flatMap((output) => output.panels).slice(0, 12);
    const genericModel = {
      ...model,
      sculptureName: "Custom wiring",
      outputs: [{
        ...model.outputs[0]!,
        label: "Custom chain",
        gpio: 25,
        color: "#123456",
        panels,
        physicalStart: panels[0]!.physicalStart,
        physicalEnd: panels.at(-1)!.physicalEnd,
      }],
    };
    const html = renderWiringAssemblyManualHtml(genericModel);

    expect(html.match(/<section class="sheet/g)).toHaveLength(4);
    expect(html.match(/class="sheet chain-sheet"/g)).toHaveLength(2);
    expect(html.match(/class="orientation-diagram"/g)).toHaveLength(12);
    expect(html).toContain("DATA OUTPUT 1 · Part 1 of 2");
    expect(html).toContain("DATA OUTPUT 1 · Part 2 of 2");
    expect(html).toContain("Continue from the previous sheet.");
    expect(html).toContain("Custom chain · GPIO 25");
    expect(html).toContain("--output-color:#123456");
    expect(html).toContain("Print / Save PDF");

    const emptyHtml = renderWiringAssemblyManualHtml({
      ...genericModel,
      outputs: [{ ...genericModel.outputs[0]!, panels: [] }],
    });
    expect(emptyHtml.match(/<section class="sheet/g)).toHaveLength(3);
    expect(emptyHtml).toContain("No panels assigned");
    expect(emptyHtml).toContain("No panels");
  });

  it("defines A4 landscape print rules and keeps chain rows intact", () => {
    const css = readFileSync("web/src/wiring-manual.css", "utf8");
    expect(css).toContain("@page { size: A4 landscape");
    expect(css).toContain("break-inside: avoid");
    expect(css).toContain(".no-print { display: none");
  });

  it("renders a self-contained printable HTML document for direct download", async () => {
    const { source, project, contract } = await fixture();
    const model = createWiringAssemblyManualModel(
      project.sculpture,
      contract,
      project.panelProfile,
      source,
    );
    const css = readFileSync("web/src/wiring-manual.css", "utf8");
    const document = renderStandaloneWiringAssemblyManualDocument(model, css);

    expect(document).toMatch(/^<!doctype html>/);
    expect(document).toContain("<style>:root {");
    expect(document).toContain("@page { size: A4 landscape");
    expect(document).toContain("Print / Save PDF");
    expect(document).not.toContain("Back to simulator");
    expect(document).toContain('window.print()');
    expect(document).toContain("SQ-03");
  });
});
