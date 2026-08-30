import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("persists the manual wiring rotation gate from Developer utilities", async ({
  page,
}) => {
  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fpose-only-two-panel%2Fsculpture.json",
  );
  await expect(page.locator("#optimize-wiring")).toBeEnabled();

  await page.locator("#developer-utilities").evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  const gate = page.locator("#toggle-wiring-rotation-gate");
  await expect(gate).toHaveAttribute("aria-pressed", "false");
  await expect(gate).toHaveText("Use manual 0/180° rotation gate");
  await gate.click();
  await expect(gate).toHaveAttribute("aria-pressed", "true");
  await expect(gate).toHaveText("Remove manual 0/180° rotation gate");
  await expect(page.locator("#wiring-optimization-summary"))
    .toContainText("manual 0/180° orientation gate");

  await page.locator("#open-project-library").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-sculpture-file").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("The browser did not expose the sculpture JSON.");
  const definition = JSON.parse(await readFile(path, "utf8")) as {
    wiring: { panelRotationConstraint?: string };
  };
  expect(definition.wiring.panelRotationConstraint).toBe("half-turns-only");
});
