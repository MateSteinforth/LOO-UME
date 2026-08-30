import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("persists the manual wiring rotation gate from Developer utilities", async ({
  page,
}) => {
  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fpose-only-two-panel%2Fsculpture.json",
  );
  await expect(page.locator("#optimize-wiring")).toBeEnabled();
  await expect(page.locator("#viewer"))
    .toHaveAttribute("data-panel-mounting-hole-count", "12");
  await expect(page.locator("#viewer"))
    .toHaveAttribute("data-panel-mounting-hole-faces", "back-only");
  await expect(page.locator("#viewer"))
    .toHaveAttribute("data-panel-din-hole-color", "4ade80");
  await expect(page.locator("#viewer"))
    .toHaveAttribute("data-panel-dout-hole-color", "ff4d6d");

  await page.locator("#developer-utilities").evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  const gate = page.locator("#toggle-wiring-rotation-gate");
  await expect(gate).toHaveClass(/editor-button/);
  await expect(gate).toHaveAttribute("aria-pressed", "false");
  await expect(gate).toHaveText("Use current poses + 0/180° gate");
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
