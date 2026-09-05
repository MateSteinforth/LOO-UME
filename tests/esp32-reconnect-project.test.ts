import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { setWiringOutputGpios } from "../src/sculpture/SculptureEditor.ts";
import {
  createEsp32ReconnectProject,
  loadEsp32ReconnectProject,
  rememberEsp32ReconnectProject,
  saveEsp32ReconnectProject,
} from "../web/src/Esp32ReconnectProject.ts";

describe("ESP32 startup project", () => {
  it("saves the project before it records desktop reconnect permission", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({ schemaVersion: "1.0.0", enabled: true }),
      );
    await rememberEsp32ReconnectProject(new Uint8Array(), request);
    expect(
      request.mock.calls.map(([path, options]) => [path, options?.method]),
    ).toEqual([
      ["/api/esp32-reconnect-project", "PUT"],
      ["/api/esp32-reconnect-authorization", "POST"],
    ]);
  });

  it("does not create reconnect permission when the project save fails", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      rememberEsp32ReconnectProject(new Uint8Array(), request),
    ).rejects.toThrow(/HTTP 500/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("restores the saved GPIOs and poses from the complete project", async () => {
    const source = parsePanelAssemblyDefinition(
      JSON.parse(
        await readFile(
          "sculptures/rhombicosidodecahedron/sculpture.json",
          "utf8",
        ),
      ),
    );
    const definition = setWiringOutputGpios(source, [16, 17, 21, 22]);
    const profile = new Uint8Array(
      await readFile("catalog/panels/ws2812b-8x8-66x65.json"),
    );
    const project = createPanelAssemblyProject(
      definition,
      JSON.parse(new TextDecoder().decode(profile)),
    );
    const bytes = createEsp32ReconnectProject(project, new Map());
    const save = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect(await saveEsp32ReconnectProject(bytes, save)).toBe(true);
    const body = save.mock.calls[0]![1]!.body as Uint8Array;
    expect(body).toEqual(bytes);
    const loadProfile = vi
      .fn()
      .mockResolvedValue(JSON.parse(new TextDecoder().decode(profile)));
    const bundle = await loadEsp32ReconnectProject(
      loadProfile,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(Uint8Array.from(body))),
    );
    try {
      expect(
        bundle?.project.sculpture.wiring?.outputs?.map((output) => output.gpio),
      ).toEqual([16, 17, 21, 22]);
      expect(bundle?.project.sculpture.panels).toEqual(definition.panels);
      expect(bundle?.project.sculpture.panelProfile).toEqual(
        definition.panelProfile,
      );
    } finally {
      bundle?.dispose();
    }
  });

  it("permits hosts without desktop project storage", async () => {
    for (const response of [
      new Response(null, { status: 404 }),
      new Response("<html>", { headers: { "Content-Type": "text/html" } }),
    ]) {
      expect(
        await loadEsp32ReconnectProject(
          vi.fn(),
          vi.fn<typeof fetch>().mockResolvedValue(response),
        ),
      ).toBeUndefined();
    }
  });

  it("reports a damaged saved project and a failed save", async () => {
    await expect(
      loadEsp32ReconnectProject(
        vi.fn(),
        vi.fn<typeof fetch>().mockResolvedValue(new Response("broken")),
      ),
    ).rejects.toThrow(/ZIP/);
    await expect(
      saveEsp32ReconnectProject(
        new Uint8Array(),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 500 })),
      ),
    ).rejects.toThrow(/HTTP 500/);
  });
});
