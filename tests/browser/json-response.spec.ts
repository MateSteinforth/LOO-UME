import { expect, test } from "@playwright/test";

test("reports an HTML sculpture fallback without exposing a JSON parser error", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?sculptureJson=./missing-project.json");

  await expect(page.locator("#engine-status")).toHaveText("Engine failed to load");
  await expect(page.locator("#viewer-error")).toContainText(
    "Sculpture JSON returned an HTML page",
  );
  await expect(page.locator("#viewer-error")).not.toContainText(
    "Unexpected token",
  );
  expect(pageErrors).toEqual([]);
});
