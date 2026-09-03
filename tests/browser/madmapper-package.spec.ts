import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";

test("downloads the mapping-ready MadMapper review package", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  const button = page.locator("#download-madmapper-package");
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button.locator("xpath=ancestor::section[1]")).toHaveAttribute(
    "data-toolbox",
    "mapping",
  );

  const labelButton = page.locator("#download-panel-labels");
  await expect(labelButton).toBeVisible();
  await expect(labelButton).toBeEnabled();
  await expect(labelButton.locator("xpath=ancestor::section[1]")).toHaveAttribute(
    "data-toolbox",
    "fabrication",
  );
  const labelDownloadPromise = page.waitForEvent("download");
  await labelButton.click();
  const labelDownload = await labelDownloadPromise;
  expect(labelDownload.suggestedFilename()).toBe(
    "generated-rhombicosidodecahedron-41-panel-preview-fabrication.zip",
  );
  const labelDownloadPath = await labelDownload.path();
  if (!labelDownloadPath) throw new Error("The browser did not expose the panel-label PDF.");
  const labelEntries = unzipSync(await readFile(labelDownloadPath));
  expect(Object.keys(labelEntries)).toEqual([
    "panel-labels-herma-4385.pdf",
    "manufacturing-manual.pdf",
  ]);
  const labelPdf = Buffer.from(
    labelEntries["panel-labels-herma-4385.pdf"]!,
  ).toString("latin1");
  expect(labelPdf).toContain("%LOOUME-HERMA-4385");
  expect(labelPdf).toContain("(SQ-03) Tj");
  expect(labelPdf).toContain("/Count 1");
  expect(Buffer.from(labelEntries["manufacturing-manual.pdf"]!).toString("latin1"))
    .toContain("%LOOUME-MANUFACTURING-MANUAL");
  await expect(page.locator("#pipeline-status")).toContainText(
    "manufacturing manual",
  );

  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-panel-labels-at-din",
    "41",
  );

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const root = "generated-rhombicosidodecahedron-41-panel-preview-madmapper";
  expect(download.suggestedFilename()).toBe(
    `${root}.zip`,
  );
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("The browser did not expose the MadMapper ZIP.");
  const entries = unzipSync(await readFile(downloadPath));
  expect(Object.keys(entries).sort()).toEqual([
    `${root}/SETUP.pdf`,
    `${root}/artnet-unicast-loopback.csv`,
    `${root}/fixtures.svg`,
    `${root}/manifest.json`,
    `${root}/patch.csv`,
  ]);
  const manifest = JSON.parse(new TextDecoder().decode(
    entries[`${root}/manifest.json`],
  ));
  expect(manifest).toMatchObject({
    panelFixtureCount: 41,
    pixelFixtureCount: 2_624,
    fixtureLayout: "individual-physical-pixels",
    universeCount: 16,
  });
  expect(manifest.mappingFingerprint).toMatch(/^[0-9a-f]{8}$/);
  const fixturesSvg = new TextDecoder().decode(
    entries[`${root}/fixtures.svg`],
  );
  expect(fixturesSvg).toContain(`mapping fingerprint ${manifest.mappingFingerprint}`);
  expect(fixturesSvg).toContain('fixture_definition="Generic - Pixel RGB"');
  expect(fixturesSvg).not.toContain("Generic – Pixel RGB");
  expect(new TextDecoder().decode(
    entries[`${root}/SETUP.pdf`],
  )).toContain("DRAFT - SCULPTURE OUTPUT REQUIRES LIVE-020 VALIDATION");
  await expect(page.locator("#pipeline-status")).toContainText(
    `Downloaded ${root}.zip`,
  );
});
