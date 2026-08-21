import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

async function chooseFile(
  page: Page,
  buttonSelector: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
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

test("generates exact Manifold parts through the real UI and reopens a ZIP", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const source = JSON.parse(
    await readFile("sculptures/panel-outline-prism/sculpture.json", "utf8"),
  ) as Record<string, unknown>;
  delete source.boundaryTopology;
  delete source.generatedMechanics;

  await page.goto("/");
  await expect(page.locator("#engine-status")).toContainText("WLED effects ready");
  await expect(page.locator("#surface-status")).toContainText("watertight");
  await expect(page.locator("#automatically-place-panels")).toBeEnabled();

  await chooseFile(page, "#load-sculpture-file", {
    name: "panel-outline-prism.json",
    mimeType: "application/json",
    buffer: Buffer.from(`${JSON.stringify(source)}\n`),
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded panel-outline-prism.json",
  );
  await expect(page.locator("#panel-count-display")).toHaveText("4");
  await expect(page.locator("#mapping-note")).toContainText(
    "No printable mechanics exist yet",
  );
  await expect(page.locator("#generate-print-parts")).toBeEnabled();

  await page.locator("#generate-print-parts").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Generated and SHA-256 verified",
    { timeout: 120_000 },
  );
  await expect(page.locator("#mapping-note")).not.toContainText(
    "No printable mechanics exist yet",
  );

  const stlZipPromise = page.waitForEvent("download");
  await page.locator("#download-print-parts").click();
  const stlZipDownload = await stlZipPromise;
  expect(stlZipDownload.suggestedFilename()).toBe(
    "panel-outline-prism-boundary-fixture-stl-parts.zip",
  );
  const stlZipPath = await stlZipDownload.path();
  if (!stlZipPath) throw new Error("The browser did not expose the STL ZIP.");
  const stlZipFiles = unzipSync(await readFile(stlZipPath));
  expect(Object.keys(stlZipFiles).sort()).toEqual([
    "mechanics/boundary.stl",
    "mechanics/parts/part-001.stl",
    "mechanics/parts/part-002.stl",
  ]);
  await expect(page.locator("#pipeline-status")).toContainText(
    "Downloaded one ZIP with 3 SHA-256-verified STL files",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-sculpture-file").click();
  const saved = await readJsonDownload(await downloadPromise);
  expect(saved.boundaryTopology).toMatchObject({
    kind: "panel-outline-gap-cycles",
  });
  expect(saved.generatedMechanics).toMatchObject({
    status: { generation: "complete", validation: "passed" },
    parts: [
      { id: "part-001", format: "stl" },
      { id: "part-002", format: "stl" },
    ],
  });

  const zipPromise = page.waitForEvent("download");
  await page.locator("#export-project-zip").click();
  const zipPath = await (await zipPromise).path();
  if (!zipPath) throw new Error("The browser did not expose the generated ZIP.");
  const zipBytes = await readFile(zipPath);
  const files = unzipSync(zipBytes);
  const names = Object.keys(files);
  expect(names.some((name) => name.endsWith("sculpture.json"))).toBe(true);
  expect(names.some((name) => name.endsWith("part-001.stl"))).toBe(true);
  expect(names.some((name) => name.endsWith("part-002.stl"))).toBe(true);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
