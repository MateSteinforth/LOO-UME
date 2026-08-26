import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";

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
    asset: { version: "2.0", generator: "LOO/UME browser test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4, target: 34962 },
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

async function chooseFile(
  page: Page,
  buttonSelector: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  if (buttonSelector === "#open-project-file") {
    await page.locator(".action-menu").first().evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
  }
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(buttonSelector).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

async function readJsonDownload(download: Download): Promise<Record<string, unknown>> {
  const path = await download.path();
  if (!path) throw new Error("The browser did not expose the downloaded JSON file.");
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("authors and saves a mechanics-free GLB project through real controls", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "design/placement-surface.glb",
  );

  const projectBytes = await readFile("sculptures/pose-only-two-panel/sculpture.json");
  await page.locator(".action-menu").first().locator("summary").click();
  await chooseFile(page, "#open-project-file", {
    name: "pose-only-two-panel.json",
    mimeType: "application/json",
    buffer: projectBytes,
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded pose-only-two-panel.json.",
  );
  await expect(page.locator(".route-panel")).toHaveCount(2);
  await expect(page.locator("#add-panel-controls")).toBeHidden();

  await page.locator("#advanced-tools > summary").click();
  await expect(page.locator("#advanced-tools #display-mode")).toBeVisible();
  await expect(page.locator("#advanced-tools #auto-rotate")).toBeVisible();
  await expect(page.locator("#advanced-tools #panel-labels")).toBeVisible();
  await expect(page.locator("#advanced-tools #printable-layer")).toBeVisible();
  await expect(page.locator("#advanced-tools #surface-scale")).toBeVisible();
  await expect(page.locator("#advanced-tools #structural-connector-settings")).toBeVisible();
  await expect(page.locator("#panel-transform-mode")).toHaveValue("surface");
  await page.locator("#panel-transform-mode").selectOption("free-3d");
  await expect(page.locator("#pipeline-status")).toContainText(
    "Free 6DOF panel transforms are active",
  );
  await page.locator("#panel-transform-mode").selectOption("surface");
  await expect(page.locator("#pipeline-status")).toContainText(
    "Surface move mode is active",
  );
  await page.locator("#surface-scale").fill("1");
  await chooseFile(page, "#load-design-surface", {
    name: "tetrahedron.glb",
    mimeType: "model/gltf-binary",
    buffer: tetrahedronGlb(),
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "4 triangles, 100 × 100 × 100 mm, watertight",
  );
  await expect(page.locator("#automatically-place-panels")).toBeEnabled();
  await expect(page.locator("#automatic-panel-count")).toHaveValue("30");

  await page.locator("#automatic-panel-count").fill("4");
  await page.locator("#automatically-place-panels").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Placed P-03, P-04 across the active GLB",
  );
  await expect(page.locator(".route-panel")).toHaveCount(4);

  const selectedLabel = page.locator(".panel-label:visible").first();
  await expect(selectedLabel).toBeVisible();
  const deletedPanelId = await selectedLabel.getAttribute("data-panel-id");
  if (!deletedPanelId) throw new Error("No visible panel label is selectable.");
  await selectedLabel.click();
  await expect(selectedLabel).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pipeline-status")).toContainText(
    `Selected ${deletedPanelId}.`,
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Available: move along the surface, rotate around local Z, delete",
  );
  await page.getByRole("button", {
    name: `Delete selected panel ${deletedPanelId}`,
  }).click();
  await expect(page.locator(`[data-panel-id="${deletedPanelId}"]`)).toHaveCount(0);
  await expect(page.locator(".route-panel")).toHaveCount(3);
  await expect(page.locator("#pipeline-status")).toContainText(
    `Deleted ${deletedPanelId}. Mapping and wiring refreshed; no printable mechanics exist yet.`,
  );

  await expect(page.locator("#generate-mapping, #open-wiring-manual, .export-menu"))
    .toHaveCount(0);
  await expect(page.locator("#connector-layer")).toBeEnabled();
  await expect(page.locator("#wiring-layer")).toBeEnabled();
  await expect(page.locator(".output-layer-toggle").first()).toBeEnabled();
  await page.locator("#wiring-layer").uncheck();
  await page.locator("#wiring-layer").check();
  await expect(page.locator("#play-toggle, #restart")).toHaveCount(0);
  await expect(page.locator(
    "#primary-color, #secondary-color, #shell-transparency",
  )).toHaveCount(0);
  await expect(page.locator("#advanced-tools #led-count")).toBeVisible();
  await expect(page.locator("#advanced-tools #apply-count")).toBeVisible();
  await expect(page.locator(
    ".viewer-overlay, #fps, #led-count-display, #panel-count-display, #frame-time, " +
      "#engine-status, #viewer-error, #mapping-status, #mapping-note, " +
      "#surface-status, #selected-panel-status, #route-editor-status",
  )).toHaveCount(0);
  await expect(page.locator("#pipeline-status")).toHaveCount(1);

  const savedDownloadPromise = page.waitForEvent("download");
  await page.locator("#save-sculpture-file").click();
  const savedDownload = await savedDownloadPromise;
  expect(savedDownload.suggestedFilename()).toBe(
    "pose-only-two-panel-fixture.sculpture.json",
  );
  const saved = await readJsonDownload(savedDownload);
  const savedPanels = saved.panels as Array<Record<string, unknown>>;
  expect(savedPanels).toHaveLength(3);
  expect(savedPanels.some((panel) => panel.id === deletedPanelId)).toBe(false);
  expect(saved.wiring).toMatchObject({ chainLengths: [3] });
  expect(saved.designSurface).toMatchObject({
    source: "tetrahedron.glb",
    scaleToMillimeters: 1,
  });
  expect((saved.designSurface as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(saved).not.toHaveProperty("mechanicalShell");
  expect(saved).not.toHaveProperty("closures");

  const closureProject = await readFile(
    "sculptures/truncated-octahedron/sculpture.json",
  );
  await chooseFile(page, "#open-project-file", {
    name: "truncated-octahedron.json",
    mimeType: "application/json",
    buffer: closureProject,
  });
  await expect(page.locator("#add-panel-controls")).toBeVisible();
  await expect(page.locator("#add-panel")).toBeHidden();
  const eligibleFace = await page.locator("#add-panel-face option").nth(1)
    .getAttribute("value");
  if (!eligibleFace) throw new Error("The fixture has no eligible closure face.");
  await page.locator("#add-panel-face").selectOption(eligibleFace);
  await expect(page.locator("#add-panel")).toBeVisible();

  await expect(page.locator(".pipeline-status--error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
