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
    `${root}/fixtures.svg`,
    `${root}/manifest.json`,
    `${root}/patch.csv`,
  ]);
  const manifest = JSON.parse(new TextDecoder().decode(
    entries[`${root}/manifest.json`],
  ));
  expect(manifest).toMatchObject({
    panelFixtureCount: 41,
    universeCount: 16,
  });
  expect(manifest.mappingFingerprint).toMatch(/^[0-9a-f]{8}$/);
  expect(new TextDecoder().decode(
    entries[`${root}/fixtures.svg`],
  )).toContain(`mapping fingerprint ${manifest.mappingFingerprint}`);
  expect(new TextDecoder().decode(
    entries[`${root}/SETUP.pdf`],
  )).toContain("DRAFT - ART-NET HARDWARE SETTINGS REQUIRE LIVE-010 VALIDATION");
  await expect(page.locator("#pipeline-status")).toContainText(
    `Downloaded ${root}.zip`,
  );
});
