import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import {
  generatePanelBoundaryParts,
  type ScadRenderer,
} from "../../src/cad/GeneratePanelBoundaryParts.ts";
import { serializeAsciiStl } from "../../src/cad/Stl.ts";
import {
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly.ts";

interface UrlAuditEntry {
  url: string;
  type: string;
  size: number;
  sha256?: string;
}

interface BrowserAudit {
  created: UrlAuditEntry[];
  revoked: string[];
  fetched: string[];
  folderWrites: Record<string, number[]>;
  folderWriteOrder: string[];
}

interface PortableFixture {
  directory: string;
  definition: PanelAssemblyDefinition;
  project: PanelAssemblyProject;
  assets: Map<string, Buffer>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function tetrahedronGlb(): Buffer {
  const positions = [
    50, 50, 50,
    -50, -50, 50,
    -50, 50, -50,
    50, -50, -50,
  ];
  const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
  const binary = Buffer.alloc(positions.length * 4 + indices.length * 2);
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  indices.forEach((value, index) => {
    binary.writeUInt16LE(value, positions.length * 4 + index * 2);
  });
  const document = {
    asset: { version: "2.0", generator: "WLED Orbital Lab browser test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.length * 4,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positions.length * 4,
        byteLength: indices.length * 2,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-50, -50, -50],
        max: [50, 50, 50],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" },
    ],
  };
  const jsonBytes = Buffer.from(JSON.stringify(document));
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  jsonBytes.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryHeader = 20 + jsonChunk.length;
  glb.writeUInt32LE(binary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb;
}

async function createPortableFixture(directory: string): Promise<PortableFixture> {
  const source = "sculptures/panel-outline-prism/sculpture.json";
  const definition = parsePanelAssemblyDefinition(JSON.parse(
    await readFile(source, "utf8"),
  ));
  const glb = tetrahedronGlb();
  definition.designSurface = {
    kind: "triangle-mesh",
    format: "glb",
    source: "design/tetrahedron.glb",
    sha256: sha256(glb),
    scaleToMillimeters: 1,
    status: "watertight",
  };
  const project = createPanelAssemblyProject(definition, source);
  const renderScad: ScadRenderer = async (_inputScad, outputStl) => {
    await writeFile(
      outputStl,
      serializeAsciiStl(
        "browser-test-part",
        [[0, 0, 0], [10, 0, 0], [0, 10, 2]],
        [[0, 1, 2]],
      ),
    );
  };
  const result = await generatePanelBoundaryParts(project, {
    outputDirectory: directory,
    designSurfaceBytes: glb,
    renderScad,
  });
  const generatedMechanics = result.definition.generatedMechanics;
  if (!generatedMechanics) {
    throw new Error("The generated fixture has no mechanics manifest.");
  }
  const references = [
    result.definition.designSurface!,
    generatedMechanics.boundary,
    ...generatedMechanics.parts,
  ];
  expect(references).toHaveLength(4);
  const assets = new Map<string, Buffer>();
  for (const reference of references) {
    const bytes = await readFile(join(result.outputDirectory, reference.source));
    expect(sha256(bytes)).toBe(reference.sha256);
    assets.set(reference.source, bytes);
  }
  return {
    directory: result.outputDirectory,
    definition: result.definition,
    project,
    assets,
  };
}

async function installBrowserAudit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const audit: BrowserAudit = {
      created: [],
      revoked: [],
      fetched: [],
      folderWrites: {},
      folderWriteOrder: [],
    };
    (window as unknown as { __portableAudit: BrowserAudit }).__portableAudit =
      audit;
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource): string => {
      const url = originalCreate(object);
      const blob = object instanceof Blob ? object : undefined;
      const entry: UrlAuditEntry = {
        url,
        type: blob?.type ?? "",
        size: blob?.size ?? 0,
      };
      audit.created.push(entry);
      if (blob) {
        void blob.arrayBuffer()
          .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
          .then((digest) => {
            entry.sha256 = Array.from(new Uint8Array(digest), (value) =>
              value.toString(16).padStart(2, "0")
            ).join("");
          });
      }
      return url;
    };
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string): void => {
      audit.revoked.push(url);
      originalRevoke(url);
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("blob:")) audit.fetched.push(url);
      return originalFetch(input, init);
    };
    interface TestDirectoryHandle {
      getDirectoryHandle(
        name: string,
        options: { create: true },
      ): Promise<TestDirectoryHandle>;
      getFileHandle(
        name: string,
        options: { create: true },
      ): Promise<{
        createWritable(): Promise<{
          write(data: Blob): Promise<void>;
          close(): Promise<void>;
        }>;
      }>;
    }
    const directory = (prefix: string): TestDirectoryHandle => ({
      getDirectoryHandle: async (name) => directory(`${prefix}${name}/`),
      getFileHandle: async (name) => ({
        createWritable: async () => ({
          write: async (data) => {
            const path = `${prefix}${name}`;
            audit.folderWrites[path] = Array.from(
              new Uint8Array(await data.arrayBuffer()),
            );
            audit.folderWriteOrder.push(path);
          },
          close: async () => undefined,
        }),
      }),
    });
    (window as unknown as {
      showDirectoryPicker: () => Promise<TestDirectoryHandle>;
    }).showDirectoryPicker = async () => directory("");
  });
}

async function objectUrlSha256(page: Page, url: string): Promise<string> {
  return page.evaluate(async (objectUrl) => {
    const response = await fetch(objectUrl);
    if (!response.ok) {
      throw new Error(`Object URL returned ${response.status}.`);
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
  }, url);
}

async function browserAudit(page: Page): Promise<BrowserAudit> {
  return page.evaluate(() =>
    (window as unknown as { __portableAudit: BrowserAudit }).__portableAudit
  );
}

async function chooseDirectory(page: Page, directory: string): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#load-project-folder").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(directory);
}

async function chooseZip(
  page: Page,
  name: string,
  buffer: Uint8Array,
): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#load-project-zip").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name,
    mimeType: "application/zip",
    buffer: Buffer.from(buffer),
  });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("The browser did not expose the downloaded ZIP.");
  return readFile(path);
}

function relativeZipFiles(zipBytes: Uint8Array): Map<string, Uint8Array> {
  const entries = unzipSync(zipBytes);
  const sculpturePath = Object.keys(entries).find((path) =>
    path.endsWith("/sculpture.json")
  );
  if (!sculpturePath) throw new Error("The ZIP has no rooted sculpture.json.");
  const root = sculpturePath.slice(0, -"sculpture.json".length);
  return new Map(
    Object.entries(entries)
      .filter(([path]) => path.startsWith(root))
      .map(([path, bytes]) => [path.slice(root.length), bytes]),
  );
}

function assetEntries(audit: BrowserAudit): UrlAuditEntry[] {
  return audit.created.filter(({ type }) =>
    type === "model/gltf-binary" || type === "model/stl"
  );
}

test("round-trips portable folder and ZIP controls with exact browser assets", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installBrowserAudit(page);
  const fixture = await createPortableFixture(
    testInfo.outputPath("portable-prism"),
  );
  expect(
    getGeneratedMechanicsState(fixture.definition, fixture.project.panelProfile),
  ).toBe("current");
  const expectedAssetHashes = new Set(
    [...fixture.assets.values()].map((bytes) => sha256(bytes)),
  );

  await page.goto("/");
  await expect(page.locator("#engine-status")).toContainText(
    "WLED effects ready",
  );
  await expect(page.locator("#surface-status")).toContainText(
    "sculpture JSON face graph",
  );
  await chooseDirectory(page, fixture.directory);
  await expect(page.locator("#surface-status")).toContainText(
    "4 triangles, 100 × 100 × 100 mm, watertight",
  );
  await expect(page.locator("#mapping-note")).toContainText(
    "same SHA-256-verified STL bytes (2 parts)",
  );
  await expect(page.locator("#download-print-parts")).toBeEnabled();
  await expect(page.locator("#printable-layer")).toBeEnabled();
  await expect.poll(async () => {
    const entries = assetEntries(await browserAudit(page));
    return entries.filter(({ sha256 }) => sha256 !== undefined).length;
  }).toBe(4);
  const folderAudit = await browserAudit(page);
  const folderAssetEntries = assetEntries(folderAudit);
  expect(new Set(folderAssetEntries.map(({ sha256 }) => sha256)))
    .toEqual(expectedAssetHashes);
  for (const { url } of folderAssetEntries) {
    expect(folderAudit.fetched).toContain(url);
    expect(folderAudit.revoked).not.toContain(url);
  }

  await page.locator("#export-project-folder").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Exported complete project folder panel-outline-prism-boundary-fixture",
  );
  const exportedFolder = await browserAudit(page);
  const folderPrefix = "panel-outline-prism-boundary-fixture/";
  expect(exportedFolder.folderWriteOrder.at(-1)).toBe(
    `${folderPrefix}sculpture.json`,
  );
  expect(Object.keys(exportedFolder.folderWrites).sort()).toEqual([
    `${folderPrefix}design/tetrahedron.glb`,
    `${folderPrefix}mechanics/boundary.stl`,
    `${folderPrefix}mechanics/parts/part-001.stl`,
    `${folderPrefix}mechanics/parts/part-002.stl`,
    `${folderPrefix}sculpture.json`,
  ]);
  for (const [path, expected] of fixture.assets) {
    expect(Buffer.from(exportedFolder.folderWrites[`${folderPrefix}${path}`]!))
      .toEqual(expected);
  }

  const currentDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-project-zip").click();
  const currentDownload = await currentDownloadPromise;
  expect(currentDownload.suggestedFilename()).toBe(
    "panel-outline-prism-boundary-fixture.zip",
  );
  const currentZipBytes = await downloadBytes(currentDownload);
  const currentFiles = relativeZipFiles(currentZipBytes);
  expect([...currentFiles.keys()].sort()).toEqual([
    "design/tetrahedron.glb",
    "mechanics/boundary.stl",
    "mechanics/parts/part-001.stl",
    "mechanics/parts/part-002.stl",
    "sculpture.json",
  ]);
  for (const [path, expected] of fixture.assets) {
    expect(Buffer.from(currentFiles.get(path)!)).toEqual(expected);
  }
  const currentDefinition = JSON.parse(
    Buffer.from(currentFiles.get("sculpture.json")!).toString("utf8"),
  ) as Record<string, unknown>;
  expect(currentDefinition.designSurface).toEqual(
    fixture.definition.designSurface,
  );
  expect(currentDefinition.generatedMechanics).toEqual(
    fixture.definition.generatedMechanics,
  );

  const fullEntries = unzipSync(currentZipBytes);
  const partPath = Object.keys(fullEntries).find((path) =>
    path.endsWith("/mechanics/parts/part-001.stl")
  );
  const glbPath = Object.keys(fullEntries).find((path) =>
    path.endsWith("/design/tetrahedron.glb")
  );
  if (!partPath || !glbPath) throw new Error("The valid ZIP lacks test assets.");
  const missingEntries = { ...fullEntries };
  delete missingEntries[partPath];
  await chooseZip(page, "missing-part.zip", zipSync(missingEntries));
  await expect(page.locator("#pipeline-status")).toContainText(
    "missing referenced file mechanics/parts/part-001.stl",
  );
  await expect(page.locator("#pipeline-status")).toHaveClass(
    /pipeline-status--error/,
  );
  const tamperedEntries = { ...fullEntries };
  const tamperedGlb = Uint8Array.from(tamperedEntries[glbPath]!);
  tamperedGlb[tamperedGlb.length - 1] ^= 0xff;
  tamperedEntries[glbPath] = tamperedGlb;
  await chooseZip(page, "tampered-glb.zip", zipSync(tamperedEntries));
  await expect(page.locator("#pipeline-status")).toContainText(
    "failed SHA-256 verification",
  );
  await expect(page.locator("#pipeline-status")).toHaveClass(
    /pipeline-status--error/,
  );
  const afterFailures = await browserAudit(page);
  expect(assetEntries(afterFailures)).toHaveLength(4);
  for (const { url } of folderAssetEntries) {
    expect(afterFailures.revoked).not.toContain(url);
  }

  await chooseZip(page, "current-project.zip", currentZipBytes);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project current-project.zip with 4 verified assets",
  );
  await expect(page.locator("#mapping-note")).toContainText(
    "same SHA-256-verified STL bytes (2 parts)",
  );
  const reopenedAudit = await browserAudit(page);
  const reopenedAssets = assetEntries(reopenedAudit).filter(
    ({ url }) => !folderAssetEntries.some((entry) => entry.url === url),
  );
  expect(reopenedAssets).toHaveLength(4);
  expect(new Set(await Promise.all(
    reopenedAssets.map(({ url }) => objectUrlSha256(page, url)),
  ))).toEqual(expectedAssetHashes);
  for (const { url } of folderAssetEntries) {
    expect(reopenedAudit.revoked).toContain(url);
  }
  for (const { url } of reopenedAssets) {
    expect(reopenedAudit.revoked).not.toContain(url);
    expect(reopenedAudit.fetched).toContain(url);
  }

  await page.locator("#automatic-panel-count").fill("5");
  await page.locator("#automatically-place-panels").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Placed P-01 across the active GLB",
  );
  await expect(page.locator("#panel-count-display")).toHaveText("5");
  await expect(page.locator("#mapping-status")).toContainText(
    "5 panels / 320 LEDs / 1 routes valid",
  );
  await expect(page.locator("#mapping-note")).toContainText(
    "last generated STL set is stale and hidden",
  );
  await expect(page.locator("#download-print-parts")).toBeDisabled();
  await expect(page.locator("#printable-layer")).toBeDisabled();
  const staleEditAudit = await browserAudit(page);
  for (const { url } of reopenedAssets) {
    expect(staleEditAudit.revoked).not.toContain(url);
  }

  const staleDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-project-zip").click();
  const staleZipBytes = await downloadBytes(await staleDownloadPromise);
  const afterStaleExportAudit = await browserAudit(page);
  const zipUrls = afterStaleExportAudit.created.filter(
    ({ type }) => type === "application/zip",
  );
  expect(zipUrls).toHaveLength(2);
  for (const { url } of zipUrls) {
    expect(afterStaleExportAudit.revoked).toContain(url);
  }
  const staleFiles = relativeZipFiles(staleZipBytes);
  for (const [path, expected] of fixture.assets) {
    expect(Buffer.from(staleFiles.get(path)!)).toEqual(expected);
  }
  const staleDefinition = JSON.parse(
    Buffer.from(staleFiles.get("sculpture.json")!).toString("utf8"),
  ) as Record<string, unknown>;
  expect((staleDefinition.panels as Array<{ id: string }>)).toHaveLength(5);
  expect((staleDefinition.panels as Array<{ id: string }>).some(
    ({ id }) => id === "P-01"
  )).toBe(true);
  expect(staleDefinition.wiring).toMatchObject({ chainLengths: [5] });
  expect(staleDefinition.generatedMechanics).toEqual(
    fixture.definition.generatedMechanics,
  );

  await chooseZip(page, "stale-project.zip", staleZipBytes);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project stale-project.zip with 4 verified assets",
  );
  await expect(page.locator("#surface-status")).toContainText(
    "4 triangles, 100 × 100 × 100 mm, watertight",
  );
  await expect(page.locator("#mapping-note")).toContainText(
    "last generated STL set is stale and hidden",
  );
  const staleAudit = await browserAudit(page);
  const staleAssets = assetEntries(staleAudit).filter(
    ({ url }) =>
      !folderAssetEntries.some((entry) => entry.url === url) &&
      !reopenedAssets.some((entry) => entry.url === url),
  );
  expect(staleAssets).toHaveLength(4);
  for (const { url } of reopenedAssets) {
    expect(staleAudit.revoked).toContain(url);
  }
  const staleGlb = staleAssets.find(({ type }) =>
    type === "model/gltf-binary"
  );
  if (!staleGlb) throw new Error("The stale ZIP has no GLB object URL.");
  expect(staleAudit.fetched).toContain(staleGlb.url);
  for (const { url, type } of staleAssets) {
    if (type === "model/stl") expect(staleAudit.fetched).not.toContain(url);
    expect(staleAudit.revoked).not.toContain(url);
  }
  await expect(page.locator(".pipeline-status--error")).toHaveCount(0);
  await expect(page.locator("#viewer-error")).toBeHidden();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
