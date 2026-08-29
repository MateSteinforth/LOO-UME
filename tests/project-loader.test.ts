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
import {
  deleteLocalProjectPackage,
  renameLocalProjectPackage,
  saveLocalProjectPackage,
} from "../web/src/ProjectLibraryClient.ts";

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

  it("falls back to tracked demo ZIPs when a static host has no library API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: "1.0.0",
        defaultSource: "./projects/demos/one.loo.zip",
        projects: [{
          id: "one",
          name: "One",
          source: "./projects/demos/one.loo.zip",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadProjectLibraryRegistry()).resolves.toMatchObject({
      projects: [{ id: "one" }],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "./api/project-library");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "./projects/manifest.json");
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

  it("sends revision-gated local project mutations", async () => {
    const revision = "a".repeat(64);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        filename: "saved.loo.zip",
        revision,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        filename: "renamed.loo.zip",
        revision,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveLocalProjectPackage(
      "saved.loo.zip",
      new Uint8Array([1, 2, 3]),
    )).resolves.toEqual({ filename: "saved.loo.zip", revision });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: "PUT",
      headers: expect.objectContaining({ "If-None-Match": "*" }),
    });
    await expect(renameLocalProjectPackage(
      "saved.loo.zip",
      "renamed.loo.zip",
      revision,
    )).resolves.toEqual({ filename: "renamed.loo.zip", revision });
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      method: "PATCH",
      headers: expect.objectContaining({ "If-Match": `"${revision}"` }),
    });
    await expect(deleteLocalProjectPackage("renamed.loo.zip", revision))
      .resolves.toBeUndefined();
  });

  it("reports a stale project save from the local API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "The project changed after it was opened. Reload it before saving.",
    }), { status: 412, headers: { "content-type": "application/json" } })));

    await expect(saveLocalProjectPackage(
      "saved.loo.zip",
      new Uint8Array([1]),
      "b".repeat(64),
    )).rejects.toThrow("The project changed after it was opened");
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
