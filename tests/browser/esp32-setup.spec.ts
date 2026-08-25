import { expect, test } from "@playwright/test";

test("keeps guarded ESP32 setup in Advanced Tools and the shared activity log", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).not.toContainText("Checking");
  await page.locator("#advanced-tools").click();
  await page.locator("#open-esp32-setup").click();
  await expect(page.locator("#esp32-setup-dialog")).toBeVisible();
  await expect(page.locator("#esp32-setup-mode")).toHaveValue("smoke");
  await expect(
    page.locator("#esp32-setup-mode option[value=installation]"),
  ).toHaveAttribute("disabled", "");
  await expect(page.locator("#esp32-confirm-erase")).not.toBeChecked();
  await expect(page.locator("#esp32-confirm-power")).not.toBeChecked();
  await page.locator("#run-esp32-setup").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Enter the 2.4 GHz Wi-Fi network name",
  );
  await expect(page.locator("#pipeline-status")).toHaveCount(1);
  await expect(page.locator("#pipeline-status")).toHaveClass(/pipeline-status--error/);
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");

  await page.locator("#esp32-setup-mode").evaluate((select) => {
    (select as HTMLSelectElement).value = "installation";
  });
  await page.locator("#run-esp32-setup").click();
  await expect(page.locator("#pipeline-status")).toContainText(
    "Full installation setup is unavailable",
  );
  await page.locator("#esp32-setup-mode").selectOption("smoke");

  await page.route("**/api/esp32-firmware-status", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ available: false, error: "Approved image missing." }),
    });
  });
  await page.locator("#esp32-wifi-ssid").fill("AZ24");
  await page.locator("#esp32-wifi-password").fill("temporary-secret");
  await page.locator("#esp32-confirm-erase").check();
  await page.locator("#esp32-confirm-power").check();
  await page.locator("#run-esp32-setup").click();
  await expect(page.locator("#pipeline-status")).toContainText("Approved image missing");
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");

  await page.locator("#esp32-wifi-password").fill("temporary-secret");
  await page.locator("#close-esp32-setup").click();
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");
});
