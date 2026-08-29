import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  createLoadedSculpture,
  loadProjectLibraryRegistry,
  loadSculptureRegistry,
} from "../web/src/ProjectLoader.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser project loading boundary", () => {
  it("validates the ZIP project library", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "1.0.0",
      defaultSource: "./projects/demos/one.loo.zip",
      projects: [{
        id: "one",
        name: "One",
        source: "./projects/demos/one.loo.zip",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(loadProjectLibraryRegistry("./projects/manifest.json"))
      .resolves.toMatchObject({
        defaultSource: "./projects/demos/one.loo.zip",
        projects: [{ id: "one", name: "One" }],
      });
  });

  it("validates registry records without owning application state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "1.0.0",
      defaultSource: "./one/sculpture.json",
      sculptures: [{
        id: "one",
        name: "One",
        source: "./one/sculpture.json",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(loadSculptureRegistry("./registry.json")).resolves.toEqual({
      schemaVersion: "1.0.0",
      defaultSource: "./one/sculpture.json",
      sculptures: [{
        id: "one",
        name: "One",
        source: "./one/sculpture.json",
      }],
    });
  });

  it("rejects a registry with no usable project entries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "1.0.0",
      defaultSource: "",
      sculptures: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(loadSculptureRegistry("./registry.json")).rejects.toThrow(
      "Sculpture registry is invalid.",
    );
  });

  it("derives mapping and wiring from the supplied Schema 2 project", async () => {
    const source = "sculptures/rhombicosidodecahedron/sculpture.json";
    const definition = parsePanelAssemblyDefinition(JSON.parse(
      await readFile(source, "utf8"),
    ));
    const project = createPanelAssemblyProject(definition, source);
    const loaded = createLoadedSculpture(project);

    expect(loaded.definition).toBe(project.sculpture);
    expect(loaded.project).toBe(project);
    expect(loaded.contract.mapping.entries).toHaveLength(2_624);
    expect(loaded.contract.wiring.outputs.map((output) => output.panelIds.length))
      .toEqual([11, 10, 10, 10]);
  });
});
