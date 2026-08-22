import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

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

  await page.locator(".action-menu").first().locator("summary").click();
  await chooseFile(page, "#open-project-file", {
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
  await expect(page.locator("#assembly-package")).toHaveText(
    "Build assembly package",
  );
  await expect(page.locator("#assembly-package")).toBeEnabled();
  await page.locator(".export-menu > summary").click();
  const draftManualPromise = page.waitForEvent("download");
  await page.locator("#open-wiring-manual").click();
  const draftManualPath = await (await draftManualPromise).path();
  if (!draftManualPath) {
    throw new Error("The browser did not expose the draft assembly manual.");
  }
  const draftManual = await readFile(draftManualPath, "utf8");
  expect(draftManual).toContain("DRAFT SUGGESTION");
  expect(draftManual).toContain("GPIO unassigned");
  expect(draftManual).toContain(
    "Not route-optimized; current assumed turns are shown",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Downloaded panel-outline-prism-boundary-fixture-assembly-manual.html",
  );

  await page.locator("#assembly-package").click();
  await expect(page.locator("#assembly-package")).toHaveText(
    "Download assembly package",
    { timeout: 120_000 },
  );
  await expect(page.locator("#mapping-note")).not.toContainText(
    "No printable mechanics exist yet",
  );

  const packagePromise = page.waitForEvent("download");
  await page.locator("#assembly-package").click();
  const packageDownload = await packagePromise;
  expect(packageDownload.suggestedFilename()).toBe(
    "panel-outline-prism-boundary-fixture-assembly-package.zip",
  );
  const packagePath = await packageDownload.path();
  if (!packagePath) throw new Error("The browser did not expose the assembly package.");
  const packageBytes = await readFile(packagePath);
  const packageFiles = unzipSync(packageBytes);
  const root = "panel-outline-prism-boundary-fixture/";
  expect(Object.keys(packageFiles).sort()).toEqual([
    `${root}assembly-manual.html`,
    `${root}ledmap.json`,
    `${root}mechanics/boundary.stl`,
    `${root}mechanics/parts/part-001.stl`,
    `${root}mechanics/parts/part-002.stl`,
    `${root}sculpture.json`,
    `${root}wiring-review.json`,
  ]);
  await expect(page.locator("#pipeline-status")).toContainText(
    "project, verified geometry, assembly manual, ledmap, and wiring review",
  );
  const bundledManual = new TextDecoder().decode(
    packageFiles[`${root}assembly-manual.html`],
  );
  expect(bundledManual).toContain("DRAFT SUGGESTION");
  expect(bundledManual).toContain("GPIO unassigned");
  expect(JSON.parse(new TextDecoder().decode(
    packageFiles[`${root}ledmap.json`],
  ))).toHaveProperty("map");
  expect(JSON.parse(new TextDecoder().decode(
    packageFiles[`${root}wiring-review.json`],
  ))).toMatchObject({ status: "draft", sculptureId: source.id });
  const saved = JSON.parse(new TextDecoder().decode(
    packageFiles[`${root}sculpture.json`],
  )) as Record<string, unknown>;
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

  await chooseFile(page, "#open-project-file", {
    name: "assembly-package.zip",
    mimeType: "application/zip",
    buffer: packageBytes,
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project assembly-package.zip",
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
