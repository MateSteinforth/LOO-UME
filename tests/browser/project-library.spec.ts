import { expect, test } from "@playwright/test";

test("opens the 41-fixture demo from the ZIP project library", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await page.locator("#open-project-library").click();
  const dialog = page.locator("#project-library-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".project-card")).toHaveCount(13);
  const project = dialog.locator(".project-card", {
    hasText: "LED Rhombicosidodecahedron (41-panel)",
  });
  await expect(project.locator("img")).toBeVisible();
  await expect(project.locator("img")).toHaveAttribute(
    "src",
    /api\/project-library\/thumbnail\/demo\//,
  );
  await expect(project).toContainText("41 fixtures · Demo ZIP");
  await project.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#current-project-name")).toHaveText(
    "LED Rhombicosidodecahedron (41-panel)",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Loaded complete project LED Rhombicosidodecahedron (41-panel)",
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

  await page.reload();
  await page.locator("#open-project-library").click();
  const savedCard = dialog.locator(".project-card-shell", { hasText: filename });
  await savedCard.locator(".project-card").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#wiring-optimization-summary")).toContainText(
    "4 outputs",
  );
  await page.locator("#save-library-project").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    `Saved local project ${filename}`,
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
