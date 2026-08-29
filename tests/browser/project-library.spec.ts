import { expect, test } from "@playwright/test";

test("opens the 41-fixture demo from the ZIP project library", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await page.locator("#open-project-library").click();
  const dialog = page.locator("#project-library-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#open-project-library")).toHaveText("Project Library");
  await expect(dialog.locator("#open-project-file")).toBeVisible();
  await expect(dialog.locator("#open-project-folder")).toBeVisible();
  await expect(dialog.locator("#save-project")).toHaveText("Download complete project ZIP");
  await expect(dialog.locator("#save-sculpture-file")).toBeVisible();
  await expect(dialog.locator("#export-project-folder")).toBeVisible();
  await expect(page.locator("[data-toolbox='export']")).toHaveCount(0);
  await expect(dialog.locator(".project-card")).toHaveCount(16);
  expect(await dialog.evaluate((element) => {
    const grid = element.querySelector("#project-library-grid")!;
    const tools = element.querySelector(".project-library-tools")!;
    return Boolean(grid.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const filenameWidth = await dialog.locator("#project-library-filename")
    .evaluate((element) => element.getBoundingClientRect().width);
  const saveGroupWidth = await dialog.locator(".project-library-actions--save")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(filenameWidth - saveGroupWidth)).toBeLessThan(2);
  const modifiedTimes = await dialog.locator(".project-card-modified").evaluateAll(
    (elements) => elements.map((element) => Date.parse((element as HTMLTimeElement).dateTime)),
  );
  expect(modifiedTimes).toEqual([...modifiedTimes].sort((left, right) => right - left));
  await expect(dialog.locator(".project-card", {
    hasText: "One-metre Diameter Flexible LED Ring Demo",
  })).toBeVisible();
  await expect(dialog.locator(".project-card", {
    hasText: "Photo-derived 30-panel Wedge Sculpture",
  })).toBeVisible();
  const projectShell = dialog.locator(".project-card-shell", {
    hasText: "LED Rhombicosidodecahedron (41-panel)",
  });
  const project = projectShell.locator(".project-card");
  await expect(project.locator("img")).toBeVisible();
  await expect(project.locator("img")).toHaveAttribute(
    "src",
    /api\/project-library\/thumbnail\/demo\//,
  );
  await expect(project).toContainText("41 fixtures · Bundled ZIP");
  await expect(projectShell.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(projectShell.getByRole("button", { name: "Delete" })).toBeVisible();
  await project.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#current-project-name")).toHaveText(
    "LED Rhombicosidodecahedron (41-panel)",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project LED Rhombicosidodecahedron (41-panel)",
  );

  await page.locator("#open-project-library").click();
  await dialog.locator(".project-card", {
    hasText: "One-metre Diameter Flexible LED Ring Demo",
  }).click();
  await expect(page.locator("#current-project-name")).toHaveText(
    "One-metre Diameter Flexible LED Ring Demo",
  );

  await page.locator("#open-project-library").click();
  await project.click();
  await expect(page.locator("#current-project-name")).toHaveText(
    "LED Rhombicosidodecahedron (41-panel)",
  );
});

test("saves, reopens, renames, and deletes one local project ZIP", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const filename = `playwright-${suffix}.loo.zip`;
  const renamedFilename = `playwright-${suffix}-renamed.loo.zip`;
  await page.goto("/");
  await expect(page.locator("#wiring-optimization-summary")).toContainText(
    "4 outputs",
  );

  await page.locator("#save-library-project").click();
  const dialog = page.locator("#project-library-dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#project-library-filename").fill(filename);
  await page.locator("#save-project-as").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    `Saved local project ${filename}`,
  );
  await expect(dialog.locator(".project-card-shell", { hasText: filename }))
    .toBeVisible();
  const savedThumbnail = dialog.locator(
    ".project-card-shell",
    { hasText: filename },
  ).locator("img");
  await expect(savedThumbnail).toHaveJSProperty("naturalWidth", 480);
  await expect(savedThumbnail).toHaveJSProperty("naturalHeight", 300);
  const thumbnailSource = await savedThumbnail.getAttribute("src");
  expect(thumbnailSource).not.toBeNull();
  const thumbnailResponse = await page.request.get(
    new URL(thumbnailSource!, page.url()).toString(),
  );
  expect(thumbnailResponse.headers()["content-type"]).toBe("image/png");

  await page.reload();
  await page.locator("#open-project-library").click();
  const savedCard = dialog.locator(".project-card-shell", { hasText: filename });
  await savedCard.locator(".project-card").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#wiring-optimization-summary")).toContainText(
    "4 outputs",
  );
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.locator("#save-library-project").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    `Overwrote project ${filename}`,
  );

  await page.locator("#open-project-library").click();
  page.once("dialog", (prompt) => prompt.accept(renamedFilename));
  await dialog.locator(".project-card-shell", { hasText: filename })
    .getByRole("button", { name: "Rename" }).click();
  await expect(dialog.locator(".project-card-shell", { hasText: renamedFilename }))
    .toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.locator(".project-card-shell", { hasText: renamedFilename })
    .getByRole("button", { name: "Delete" }).click();
  await expect(dialog.locator(".project-card-shell", { hasText: renamedFilename }))
    .toHaveCount(0);
});
