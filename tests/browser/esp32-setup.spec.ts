import { expect, test } from "@playwright/test";

test("keeps guarded ESP32 setup in Advanced Tools and the shared activity log", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).not.toContainText("Checking");
  await expect(page.locator(".output-layer-toggle")).toHaveCount(4);
  await page.locator("#advanced-tools").click();
  await page.locator("#open-esp32-setup").click();
  await expect(page.locator("#esp32-setup-dialog")).toBeVisible();
  await expect(page.locator("#esp32-setup-progress")).toBeVisible();
  await expect(page.locator("#esp32-setup-progress-label")).toHaveText("Ready");
  await expect(page.locator("#esp32-setup-console")).toBeVisible();
  await expect(page.locator("#esp32-boot-instruction")).toHaveText("HOLD BOOT");
  await expect(page.locator("#esp32-setup-mode")).toHaveCount(0);
  await expect(page.locator("#esp32-confirm-erase")).toHaveCount(0);
  await expect(page.locator("#esp32-confirm-power")).toHaveCount(0);
  await page.locator("#run-esp32-setup").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#esp32-setup-console")).toContainText(
    "Live preview paused while standalone playback is verified",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "Enter the 2.4 GHz Wi-Fi network name",
  );
  await expect(page.locator("#esp32-setup-console")).toContainText(
    "Enter the 2.4 GHz Wi-Fi network name",
  );
  await expect(page.locator("#esp32-setup-console .esp32-console-entry")).not.toHaveCount(0);
  await expect(page.locator("#esp32-setup-console")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator("#pipeline-status")).toHaveCount(1);
  await expect(page.locator("#pipeline-status")).toHaveCSS("overflow-y", "auto");
  expect(await page.locator("#pipeline-status").evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeGreaterThan(150);
  await expect(page.locator("#pipeline-status")).toHaveClass(/pipeline-status--error/);
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");

  await page.route("**/api/esp32-firmware-status", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ available: false, error: "Approved image missing." }),
    });
  });
  await page.locator("#esp32-wifi-ssid").fill("AZ24");
  await page.locator("#esp32-wifi-password").fill("temporary-secret");
  await page.locator("#run-esp32-setup").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#pipeline-status")).toContainText("Approved image missing");
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");

  await page.locator("#esp32-wifi-password").fill("temporary-secret");
  await page.locator("#close-esp32-setup").click();
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");
});
