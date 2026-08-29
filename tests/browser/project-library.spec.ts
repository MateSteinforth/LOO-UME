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
