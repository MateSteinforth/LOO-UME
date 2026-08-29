import { expect, test } from "@playwright/test";

test("loads the one-metre flexible ring with mapping and hardware tools", async ({ page }) => {
  await page.goto(
    "/?sculptureJson=./sculptures/one-metre-led-ring/sculpture.json",
  );

  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await expect(page.locator("#led-count")).toHaveValue("188");
  await expect(page.locator("#viewer canvas")).toBeVisible();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-panel-labels-at-din",
    "1",
  );
  await expect(page.locator("#download-madmapper-package")).toBeEnabled();
  await expect(page.locator("#open-esp32-setup")).toBeEnabled();
  await expect(page.locator("#save-project")).toBeEnabled();
  await expect(page.locator("#automatically-place-panels")).toBeDisabled();
  await expect(page.locator("#assembly-package")).toBeDisabled();
  await expect(page.locator("#generate-structure")).toBeDisabled();
  await expect(page.locator("#generate-surface-structure")).toBeDisabled();
});
