import { expect, test } from "@playwright/test";

test("isolates and steps through a Schema 2 data chain", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fstructural-three-panel-trail%2Fsculpture.json",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await expect(page.locator("#assembly-tutorial-chain")).toHaveCount(0);
  await expect(page.locator("#assembly-tutorial-overview")).toHaveCount(0);
  await expect(
    page.locator("#wiring-layer-controls #assembly-tutorial-section"),
  ).toBeVisible();
  await expect(page.locator("#assembly-tutorial-warning")).toHaveText(
    "DRAFT ROUTE — save the route before physical assembly.",
  );

  await page.locator("#assembly-tutorial-start").click();
  await expect(page.locator("#assembly-tutorial-step")).toHaveText(
    "Chain 1 / 1 · 3 panels",
  );
  await expect(page.locator(".panel-label:visible")).toHaveCount(3);
  await expect(page.locator(".wiring-controller-label:visible")).toHaveText(
    "Controller",
  );
  await expect(page.locator(".wiring-controller-pin-label:visible")).toHaveText(
    "Output 1",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "3",
  );
  await expect(page.locator(".panel-label:visible").first()).toContainText(
    /\d+ \/ 3 · /,
  );

  await page.locator("#assembly-tutorial-next").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-instruction")).toHaveText(
    "Controller output 1 (GPIO unassigned) → P-02 DIN (top-right, back view)",
  );
  await expect(page.locator(".assembly-cable-label")).toHaveText(
    "Controller output 1 (GPIO unassigned) → P-02 DIN (top-right, back view)",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "1",
  );
  await page.locator("#assembly-tutorial-previous").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-step")).toHaveText(
    "Chain 1 / 1 · 3 panels",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "3",
  );

  await page.locator("#assembly-tutorial-next").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await page.locator("#assembly-tutorial-next").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-instruction")).toContainText(
    "P-02 DOUT",
  );
  await expect(page.locator(".panel-label--tutorial-active:visible")).toHaveCount(2);
  await page.locator("#panel-transform-mode").evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.value = "free-3d";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator(".route-panel").first().evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page.locator(".panel-delete-billboard")).toHaveCount(0);
  await page.locator("#auto-rotate").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.locator("#assembly-tutorial-exit").click();
  await expect(page.locator("#assembly-tutorial-controls")).toBeHidden();
  await expect(page.locator(".assembly-cable-label")).toHaveCount(0);
  await expect(page.locator(".panel-label").filter({ hasText: "1 / 3" }))
    .toHaveCount(0);
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-auto-rotate",
    "false",
  );
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("restores a surface-backed viewport after the tutorial", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText("watertight");
  await page.locator("#advanced-tools").evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await expect(page.locator("#automatically-place-panels")).toBeEnabled();
  await page.locator("#automatic-panel-count").fill("3");
  await page.locator("#automatically-place-panels").click();
  await expect(page.locator("#assembly-tutorial-start")).toBeEnabled();
  await page.locator("#display-mode").selectOption("physical-index");
  const autoRotate = page.locator("#auto-rotate");
  if (await autoRotate.isChecked()) await autoRotate.uncheck();
  const beforeGrid = await page.locator("#viewer").getAttribute(
    "data-grid-bounds",
  );
  expect(beforeGrid).toBeTruthy();

  await page.locator("#assembly-tutorial-start").click();
  await page.locator("#assembly-tutorial-exit").click();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-grid-bounds",
    beforeGrid!,
  );
});
