import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../../src/sculpture/PanelAssembly.ts";
import { normalizeStructuralDesign } from "../../src/sculpture/StructuralDesign.ts";
import { sha256Bytes } from "../../src/sculpture/GeneratedMechanics.ts";

async function chooseFile(
  page: Page,
  buttonSelector: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const button = page.locator(buttonSelector);
  if (!await button.isVisible() && buttonSelector === "#open-project-file") {
    await page.locator(".action-menu").first().locator("summary").click();
  }
  const chooserPromise = page.waitForEvent("filechooser");
  await button.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

test("generates, previews, transports, reopens, and invalidates a structural set", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/generator-status", async (route) => {
    await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
  });

  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "design/placement-surface.glb",
  );
  await page.locator("#sculpture-select").selectOption(
    "./sculptures/structural-three-panel-trail/sculpture.json",
  );
  await expect(page.locator("#sculpture-select")).toHaveValue(
    "./sculptures/structural-three-panel-trail/sculpture.json",
  );
  await expect(page.locator("#generate-structure")).toBeEnabled();
  await page.locator("#advanced-tools > summary").click();
  await expect(page.locator("#structural-connector-settings")).toBeVisible();
  await expect(page.locator("#connector-neighbor-distance")).toHaveValue("140");
  await expect(page.locator("#connector-neighbor-degree")).toHaveValue("2");
  await expect(page.locator("#connector-bed-x")).toHaveValue("250");
  await expect(page.locator("#connector-bed-y")).toHaveValue("250");
  await expect(page.locator("#connector-bed-z")).toHaveValue("250");
  await expect(page.locator("#connector-segment-length")).toHaveValue("220");
  await expect(page.locator("#advanced-tools #generate-structure")).toHaveCount(0);
  await expect(page.locator("#connector-pair-list")).toContainText("P-01 ↔ P-02");
  await expect(page.locator("#connector-pair-list")).toContainText("P-02 ↔ P-03");
  await expect(page.locator("#connector-pair-list")).not.toContainText("P-01 ↔ P-03");

  await page.locator("#connector-pair-first").selectOption("P-01");
  await page.locator("#connector-pair-second").selectOption("P-03");
  await page.locator("#include-connector-pair").click();
  await expect(page.locator("#pipeline-status")).toContainText("settings changed");
  await expect(page.locator("#connector-pair-list")).toContainText("P-01 ↔ P-03");
  const directPair = page.locator("#connector-pair-list label", { hasText: "P-01 ↔ P-03" });
  await directPair.locator("input").uncheck();
  await expect(page.locator("#pipeline-status")).toContainText("settings changed");
  await expect(page.locator("#connector-pair-list")).toContainText("P-02 ↔ P-03");
  await page.locator("#generate-structure").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Generated and SHA-256 verified 2 local panel-pair connectors",
    { timeout: 120_000 },
  );
  await expect(page.locator("#pipeline-status")).toContainText("2 cap-surface loft bodies");
  await expect(page.locator("#pipeline-status")).toContainText(
    "not engineering certification",
  );
  await expect(page.locator("#download-structure")).toBeEnabled();
  await expect(page.locator("#printable-layer")).toBeEnabled();

  const connectorZipPromise = page.waitForEvent("download");
  await page.locator("#download-structure").click();
  const connectorZipDownload = await connectorZipPromise;
  expect(connectorZipDownload.suggestedFilename()).toBe(
    "structural-three-panel-trail-trial-connector-ribbons.zip",
  );
  const connectorZipPath = await connectorZipDownload.path();
  if (!connectorZipPath) throw new Error("The browser did not expose the connector ZIP.");
  const connectorFiles = unzipSync(await readFile(connectorZipPath));
  expect(Object.keys(connectorFiles)).toEqual(expect.arrayContaining([
    "structure/assembly-preview.stl",
    "structure/structure.model.3mf",
    "structure/analysis.json",
    "structure/report.md",
  ]));
  expect(Object.keys(connectorFiles).some((name) => name.includes("structure/parts/")))
    .toBe(true);

  const zipPromise = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const zipDownload = await zipPromise;
  const zipPath = await zipDownload.path();
  if (!zipPath) throw new Error("The browser did not expose the structural ZIP.");
  const zipBytes = await readFile(zipPath);
  const files = unzipSync(zipBytes);
  const names = Object.keys(files);
  expect(names.some((name) => name.endsWith("catalog/panel-profile.json"))).toBe(true);
  expect(names.some((name) => name.endsWith("structure/assembly-preview.stl"))).toBe(true);
  expect(names.some((name) => name.endsWith("structure/structure.model.3mf"))).toBe(true);
  expect(names.some((name) => name.endsWith("structure/analysis.json"))).toBe(true);
  expect(names.some((name) => name.endsWith("structure/report.md"))).toBe(true);
  const partNames = names.filter((name) => name.includes("structure/parts/"));
  const analysisName = names.find((name) => name.endsWith("structure/analysis.json"))!;
  const analysis = JSON.parse(new TextDecoder().decode(files[analysisName]!)) as {
    inputSource: string;
    supports: unknown[];
    loadCases: unknown[];
    printable: {
      parts: number;
      organicConnectors: number;
      multiPanelJunctions: number;
      spliceSleeves: number;
    };
  };
  expect(analysis.inputSource).toBe("authored");
  expect(analysis.supports).toHaveLength(2);
  expect(analysis.loadCases).toHaveLength(10);
  expect(analysis.printable.organicConnectors).toBe(2);
  expect(analysis.printable.multiPanelJunctions).toBe(0);
  expect(analysis.printable.spliceSleeves).toBe(0);
  expect(partNames).toHaveLength(analysis.printable.parts);

  const sculptureName = names.find((name) => name.endsWith("sculpture.json"))!;
  const reportName = names.find((name) => name.endsWith("structure/report.md"))!;
  const importedReport = new TextEncoder().encode("# Imported structural report\n");
  const importedDefinition = JSON.parse(new TextDecoder().decode(files[sculptureName]!)) as {
    generatedStructure: { artifacts: Array<{ role: string; sha256: string }> };
    panels: Array<{ pose: { position: [number, number, number] } }>;
  };
  importedDefinition.generatedStructure.artifacts.find(({ role }) => role === "report")!.sha256 =
    sha256Bytes(importedReport);
  files[sculptureName] = new TextEncoder().encode(`${JSON.stringify(importedDefinition, null, 2)}\n`);
  files[reportName] = importedReport;
  const importedZipBytes = Buffer.from(zipSync(files, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  }));
  await chooseFile(page, "#open-project-file", {
    name: "structural-project.zip",
    mimeType: "application/zip",
    buffer: importedZipBytes,
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project structural-project.zip",
    { timeout: 60_000 },
  );
  await expect(page.locator("#download-structure")).toBeEnabled();

  const staleDefinition = structuredClone(importedDefinition);
  staleDefinition.panels[0]!.pose.position[0] += 1;
  files[sculptureName] = new TextEncoder().encode(
    `${JSON.stringify(staleDefinition, null, 2)}\n`,
  );
  await chooseFile(page, "#open-project-file", {
    name: "stale-structural-project.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files, {
      level: 6,
      mtime: new Date("1980-01-01T00:00:00.000Z"),
    })),
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project stale-structural-project.zip",
  );
  await expect(page.locator("#download-structure")).toBeDisabled();
  await expect(page.locator("#save-sculpture-file")).toBeEnabled();

  const singular = parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-two-panel/sculpture.json",
    "utf8",
  )));
  const singularProject = createPanelAssemblyProject(
    singular,
    "sculptures/pose-only-two-panel/sculpture.json",
  );
  singular.structuralDesign = structuredClone(
    normalizeStructuralDesign(singularProject).design,
  );
  singular.structuralDesign.supports = [{
    id: "insufficient-x-only",
    kind: "panel",
    panelId: "P-01",
    constrainedTranslations: ["x"],
  }];
  await chooseFile(page, "#open-project-file", {
    name: "singular-structure.json",
    mimeType: "application/json",
    buffer: Buffer.from(`${JSON.stringify(singular)}\n`),
  });
  await page.locator("#generate-structure").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "1 cap-surface loft body",
    { timeout: 120_000 },
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Advisory truss analysis: unavailable; ribbon generation is unaffected",
  );
  await expect(page.locator("#pipeline-status")).not.toHaveClass(/pipeline-status--error/);
  await expect(page.locator("#download-structure")).toBeEnabled();
  await expect(page.locator("#save-sculpture-file")).toBeEnabled();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([
    "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
  ]);
});

test("generates one local printable junction for three co-located panels", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/generator-status", async (route) => {
    await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
  });
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "design/placement-surface.glb",
  );
  await page.locator("#sculpture-select").selectOption(
    "./sculptures/structural-three-panel-junction/sculpture.json",
  );
  await page.locator("#advanced-tools > summary").click();
  await expect(page.locator("#connector-pair-list")).toContainText("P-01 ↔ P-02");
  await expect(page.locator("#connector-pair-list")).toContainText("P-02 ↔ P-03");

  await page.locator("#generate-structure").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "2 local panel-pair connectors",
    { timeout: 120_000 },
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "1 multi-panel ribbon junction",
  );
  await expect(page.locator("#pipeline-status")).not.toHaveClass(/pipeline-status--error/);
  await expect(page.locator("#download-structure")).toBeEnabled();
  await expect(page.locator("#printable-layer")).toBeEnabled();
});

test("generates the alternative full-edge LED-surface bridge", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/generator-status", async (route) => {
    await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
  });
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "design/placement-surface.glb",
  );
  await page.locator("#sculpture-select").selectOption(
    "./sculptures/structural-two-panel-spatial/sculpture.json",
  );
  await expect(page.locator("#generate-structure")).toBeEnabled();
  await expect(page.locator("#generate-surface-structure")).toBeEnabled();

  await page.locator("#generate-surface-structure").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "1 full-edge bridge",
    { timeout: 120_000 },
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "not engineering certification",
  );
  await expect(page.locator("#pipeline-status")).not.toHaveClass(/pipeline-status--error/);
  await expect(page.locator("#download-structure")).toBeEnabled();
  await expect(page.locator("#printable-layer")).toBeEnabled();

  const bridgeZipPromise = page.waitForEvent("download");
  await page.locator("#download-structure").click();
  const bridgeZip = await bridgeZipPromise;
  expect(bridgeZip.suggestedFilename()).toBe(
    "structural-two-panel-spatial-trial-led-surface-bridges.zip",
  );
});
