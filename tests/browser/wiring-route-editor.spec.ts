import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";

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
  if (!path) throw new Error("The browser did not expose the saved JSON file.");
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("edits, saves, and reopens an authored wiring route", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/?sculptureJson=.%2Fsculptures%2Fpose-only-rhombicosidodecahedron%2Fsculpture.json");
  await expect(page.locator("#pipeline-status")).toContainText(
    "design/placement-surface.glb",
  );

  const project = JSON.parse(await readFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    "utf8",
  )) as {
    panels: Array<{
      installedAddressTransform?: {
        selectionMethod?: string;
        optimizationFingerprint?: string;
      };
    }>;
    wiring: {
      status: string;
      routeRevision?: number;
      outputs: Array<{ panelIds?: string[] }>;
    };
  };
  project.wiring.status = "provisional";
  delete project.wiring.routeRevision;
  for (const output of project.wiring.outputs) delete output.panelIds;
  for (const panel of project.panels) {
    const transform = panel.installedAddressTransform;
    if (!transform) continue;
    transform.selectionMethod = "manual";
    delete transform.optimizationFingerprint;
  }
  const projectBytes = Buffer.from(JSON.stringify(project));
  await page.locator(".action-menu").first().locator("summary").click();
  await chooseFile(page, "#open-project-file", {
    name: "rhombicosidodecahedron.json",
    mimeType: "application/json",
    buffer: projectBytes,
  });
  await expect(page.locator("#route-editor-section")).toBeVisible();
  await expect(page.locator(".route-panel")).toHaveCount(41);
  await expect(page.locator("#route-editor-note")).toContainText("draft suggestion");
  await expect(page.locator("#route-action")).toHaveText("Edit suggested route");
  await expect(page.locator(".route-output legend").first()).toContainText(
    "GPIO 16",
  );
  await expect(page.locator(".route-panel").first()).toContainText("Controller →");

  const selectedPanelId = await page.locator(".route-panel").first()
    .getAttribute("data-panel-id");
  if (!selectedPanelId) throw new Error("The first route row has no panel ID.");
  await page.locator(".route-panel").first().click();
  await expect(page.locator("#pipeline-status")).toContainText(
    `Selected ${selectedPanelId}`,
  );
  await expect(page.getByRole("button", {
    name: `Delete selected panel ${selectedPanelId}`,
  })).toBeVisible();
  await expect(page.locator(".route-panel button")).toHaveCount(0);

  await page.locator("#route-action").click();
  await expect(page.locator("#route-action")).toHaveText("Save route");
  await expect(page.locator("#pipeline-status")).toContainText(
    "Route is complete. Save route revision 1.",
  );
  const firstOutputSelect = page.locator(".route-panel select").first();
  const nestedSpaceWasNotCancelled = await firstOutputSelect.evaluate((element) =>
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    }))
  );
  expect(nestedSpaceWasNotCancelled).toBe(true);
  const firstRoutePanel = page.locator(".route-panel").first();
  const originalFirstPanel = await firstRoutePanel.getAttribute("data-panel-id");
  await firstRoutePanel.dragTo(page.locator(".route-panel").nth(2));
  await expect(page.locator("#route-action")).toBeEnabled();
  await page.locator("#route-action").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Saved wiring route revision 1",
  );
  await expect(page.locator("#route-editor-note")).toContainText("saved authored route");

  await page.locator("#export-options > summary").click();
  const savedDownloadPromise = page.waitForEvent("download");
  await page.locator("#save-sculpture-file").click();
  const saved = await readJsonDownload(await savedDownloadPromise);
  expect(saved.wiring).toMatchObject({
    status: "authored",
    routeRevision: 1,
    chainLengths: [11, 10, 10, 10],
  });
  const savedPanelIds = (saved.wiring as {
    outputs: Array<{ panelIds: string[] }>;
  }).outputs[0]!.panelIds;
  expect(savedPanelIds[0]).not.toBe(originalFirstPanel);

  await chooseFile(page, "#open-project-file", {
    name: "reopened-authored-route.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded reopened-authored-route.json.",
    { timeout: 30_000 },
  );
  await expect(page.locator("#route-editor-note")).toContainText("saved authored route");
  await expect(page.locator(".route-panel").first()).toHaveAttribute(
    "data-panel-id",
    savedPanelIds[0]!,
  );
});
