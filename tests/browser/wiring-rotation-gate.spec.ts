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

test("persists safe custom ESP32 output GPIOs from Developer utilities", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#developer-utilities").evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });

  const inputs = page.locator("#output-gpio-inputs input");
  await expect(inputs).toHaveCount(4);
  expect(await inputs.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value)
  )).toEqual(["16", "17", "18", "19"]);
  for (const [index, gpio] of [21, 22, 25, 26].entries()) {
    await inputs.nth(index).fill(String(gpio));
  }
  await page.locator("#apply-output-gpios").click();
  await expect(page.locator("#wiring-optimization-summary"))
    .toContainText("GPIO 21/22/25/26");
  await expect(page.locator("#pipeline-status"))
    .toContainText("Run ESP32 setup once");

  await page.locator("#open-project-library").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-sculpture-file").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("The browser did not expose the sculpture JSON.");
  const definition = JSON.parse(await readFile(path, "utf8")) as {
    wiring: { outputs: Array<{ gpio: number }> };
  };
  expect(definition.wiring.outputs.map((output) => output.gpio)).toEqual([
    21, 22, 25, 26,
  ]);

  await inputs.nth(3).fill("25");
  await page.locator("#apply-output-gpios").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Each wiring output requires a different GPIO",
  );
  await expect(page.locator("#wiring-optimization-summary"))
    .toContainText("GPIO 21/22/25/26");
});
