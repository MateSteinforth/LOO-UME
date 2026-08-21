import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";

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
  if (!path) throw new Error("The browser did not expose the saved JSON file.");
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("copies, confirms, saves, and reopens an authored wiring route", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#engine-status")).toContainText("WLED effects ready");
  await expect(page.locator("#surface-status")).toContainText(
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
  await chooseFile(page, "#load-sculpture-file", {
    name: "rhombicosidodecahedron.json",
    mimeType: "application/json",
    buffer: projectBytes,
  });
  await expect(page.locator("#route-editor-section")).toBeVisible();
  await expect(page.locator(".route-panel")).toHaveCount(41);
  await expect(page.locator("#route-editor-note")).toContainText("draft suggestion");
  await expect(page.locator("#copy-draft-route")).toBeVisible();
  await expect(page.locator("#confirm-wiring-route")).toBeDisabled();
  await expect(page.locator(".route-output legend").first()).toContainText(
    "GPIO 16",
  );
  await expect(page.locator(".route-panel").first()).toContainText("Controller →");

  await page.locator("#copy-draft-route").click();
  const firstRoutePanel = page.locator(".route-panel").first();
  const originalFirstPanel = await firstRoutePanel.getAttribute("data-panel-id");
  await firstRoutePanel.getByRole("button", { name: /down in/i }).click();
  await expect(page.locator("#confirm-wiring-route")).toBeEnabled();
  await page.locator("#confirm-wiring-route").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Confirmed wiring route revision 1",
  );
  await expect(page.locator("#route-editor-note")).toContainText("saved authored route");

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

  await chooseFile(page, "#load-sculpture-file", {
    name: "reopened-authored-route.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator("#pipeline-status")).toHaveText(
    "Loaded reopened-authored-route.json.",
  );
  await expect(page.locator("#route-editor-note")).toContainText("saved authored route");
  await expect(page.locator(".route-panel").first()).toHaveAttribute(
    "data-panel-id",
    savedPanelIds[0]!,
  );
});
