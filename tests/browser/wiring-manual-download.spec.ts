import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("downloads the mapping-ready assembly manual without a popup", async ({
  page,
}) => {
  await page.goto(
    "/?sculptureJson=./sculptures/rhombicosidodecahedron/sculpture.json",
  );
  await expect(page.locator("#engine-status")).toContainText(
    "WLED effects ready",
  );
  await expect(page.locator("#panel-count-display")).toHaveText("41");
  await expect(page.locator("#open-wiring-manual")).toBeEnabled();
  await page.locator(".export-menu > summary").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#open-wiring-manual").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "generated-rhombicosidodecahedron-41-panel-preview-assembly-manual.html",
  );
  const path = await download.path();
  if (!path) throw new Error("The browser did not expose the assembly manual.");
  const html = await readFile(path, "utf8");
  expect(html).toMatch(/^<!doctype html>/);
  expect(html).toContain("@page { size: A4 landscape");
  expect(html).toContain("MAPPING READY");
  expect(html).toContain("SQ-03");
  expect(html).not.toContain("Back to simulator");
  await expect(page.locator("#pipeline-status")).toContainText(
    "Downloaded generated-rhombicosidodecahedron-41-panel-preview-assembly-manual.html",
  );
});
