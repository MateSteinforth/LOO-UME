import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { openPortableProjectFiles } from "../web/src/PortableProject.ts";

async function fixture(path: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
}

describe("central Schema 2 runtime validation", () => {
  it("ships a matching controller-pose JSON Schema", async () => {
    const schema = await fixture("schemas/panel-assembly.schema.json");
    const controller = schema.properties.wiring.properties.controller;
    expect(controller.properties.orientation).toEqual({
      $ref: "#/$defs/orientation",
    });
    expect(controller.dependentRequired).toEqual({ orientation: ["position"] });
    expect(schema.$defs.vector3.minItems).toBe(3);
    expect(schema.$defs.orientation.required).toEqual([
      "xAxis", "yAxis", "normal",
    ]);
    expect(schema.properties.wiring.properties.panelRotationConstraint)
      .toEqual({ const: "half-turns-only" });
  });

  it.each([
    ["mapping object", (value: Record<string, any>) => { value.mapping = null; }, /mapping must be an object/],
    ["mapping projection", (value: Record<string, any>) => { value.mapping.projection = "cube"; }, /supported projection/],
    ["mapping notes", (value: Record<string, any>) => { value.mapping.notes = [1]; }, /Mapping notes.*strings/],
    ["calibration field", (value: Record<string, any>) => { delete value.calibration.panelPixelOrder; }, /Calibration.*lifecycle/],
    ["calibration value", (value: Record<string, any>) => { value.calibration.physicalChains = "verified"; }, /Calibration.*lifecycle/],
    ["root notes", (value: Record<string, any>) => { value.notes = [false]; }, /Notes.*strings/],
    ["controller position", (value: Record<string, any>) => { value.wiring.controller.position = [1, 2]; }, /optional finite right-handed world pose/],
    ["wiring rotation constraint", (value: Record<string, any>) => { value.wiring.panelRotationConstraint = "quarter-turns"; }, /supported wiring lifecycle and route strategy/],
    ["controller orientation", (value: Record<string, any>) => {
      value.wiring.controller.position = [1, 2, 3];
      value.wiring.controller.orientation = {
        xAxis: [1, 0, 0], yAxis: [0, -1, 0], normal: [0, 0, 1],
      };
    }, /optional finite right-handed world pose/],
  ])("rejects invalid nested %s", async (_label, mutate, message) => {
    const definition = await fixture("sculptures/pose-only-two-panel/sculpture.json");
    mutate(definition);
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(message);
  });

  it("accepts an exact finite controller position", async () => {
    const definition = await fixture("sculptures/pose-only-two-panel/sculpture.json");
    definition.wiring.controller.position = [-120, 80, 45];
    expect(parsePanelAssemblyDefinition(definition).wiring.controller.position)
      .toEqual([-120, 80, 45]);
  });

  it("accepts an exact right-handed controller pose", async () => {
    const definition = await fixture("sculptures/pose-only-two-panel/sculpture.json");
    definition.wiring.controller.position = [-120, 80, 45];
    definition.wiring.controller.orientation = {
      xAxis: [0, 1, 0],
      yAxis: [-1, 0, 0],
      normal: [0, 0, 1],
    };
    expect(parsePanelAssemblyDefinition(definition).wiring.controller)
      .toMatchObject({
        position: [-120, 80, 45],
        orientation: {
          xAxis: [0, 1, 0],
          yAxis: [-1, 0, 0],
          normal: [0, 0, 1],
        },
      });
  });

  it("rejects repeated boundary corner references during load", async () => {
    const definition = await fixture("sculptures/panel-outline-prism/sculpture.json");
    definition.boundaryTopology.gaps[0].vertices[1] = structuredClone(
      definition.boundaryTopology.gaps[0].vertices[0],
    );
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /cannot repeat a panel-corner reference/,
    );
  });

  it.each([
    ["vertex", (boundary: Record<string, any>) => { boundary.vertices[0] = [0, 1]; }, /finite vertices/],
    ["face reference", (boundary: Record<string, any>) => { boundary.faces[0].vertexIndices[0] = 999; }, /valid vertex indices/],
    ["panel face", (boundary: Record<string, any>) => {
      boundary.authoredPanels.push({
        id: "P-INVALID",
        mountFaceId: "missing-face",
        pose: {
          position: [0, 0, 0],
          orientation: { xAxis: [1, 0, 0], yAxis: [0, 1, 0], normal: [0, 0, 1] },
        },
      });
    }, /known faces/],
  ])("rejects invalid authoring-boundary %s", async (_label, mutate, message) => {
    const definition = await fixture("sculptures/cuboctahedron-empty-66/sculpture.json");
    mutate(definition.mechanicalShell.authoringBoundary);
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(message);
  });

  it("uses the same project loader error for browser and CLI adapters", async () => {
    const definition = await fixture("sculptures/pose-only-two-panel/sculpture.json");
    const profile = await fixture("catalog/panels/ws2812b-8x8-66x65.json");
    definition.mapping.notes = [17];
    const browserLoad = openPortableProjectFiles(
      [{
        path: "project/sculpture.json",
        bytes: new TextEncoder().encode(JSON.stringify(definition)),
      }],
      "browser-input",
      async () => profile,
    );
    await expect(browserLoad).rejects.toThrow("Mapping notes must be an array of strings.");

    const directory = await mkdtemp(join(tmpdir(), "schema2-loader-"));
    try {
      await writeFile(join(directory, "panel.json"), JSON.stringify(profile));
      definition.panelProfile.source = "panel.json";
      await writeFile(join(directory, "sculpture.json"), JSON.stringify(definition));
      await expect(loadPanelAssemblyProjectFromFile(
        "sculpture.json",
        directory,
      )).rejects.toThrow("Mapping notes must be an array of strings.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
