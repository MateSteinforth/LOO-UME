import { expect, test } from "@playwright/test";

test("populates the network dropdown and rejects duplicate scans", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/Esp32WifiControls.ts";
    const { createEsp32WifiControls } = (await import(
      modulePath
    )) as typeof import("../../web/src/Esp32WifiControls.ts");
    const ssidInput = document.createElement("input");
    const passwordInput = document.createElement("input");
    const networkSelect = document.createElement("select");
    const scanButton = document.createElement("button");
    const forgetButton = document.createElement("button");
    const storageStatus = document.createElement("p");
    let busy = false;
    let scans = 0;
    let forgotten = false;
    const controls = createEsp32WifiControls(
      {
        ssidInput,
        passwordInput,
        networkSelect,
        scanButton,
        forgetButton,
        storageStatus,
        scan: async () => {
          scans += 1;
          return [{ name: "Guest", rssi: -40 }];
        },
        isBusy: () => busy,
        setBusy: (value) => {
          busy = value;
        },
      },
      {
        load: async () => ({ ssid: "Studio", password: "test-password" }),
        save: async () => {},
        forget: async () => {
          forgotten = true;
        },
      },
    );
    await controls.restore();
    const restoredPassword = passwordInput.value;
    scanButton.click();
    scanButton.click();
    while (busy) await new Promise((done) => setTimeout(done, 0));
    const option = networkSelect.options[1]?.text;
    networkSelect.value = "Guest";
    networkSelect.dispatchEvent(new Event("change"));
    const selected = { ssid: ssidInput.value, password: passwordInput.value };
    forgetButton.click();
    await Promise.resolve();
    return {
      scans,
      option,
      restoredPassword,
      selected,
      forgotten,
      empty: ssidInput.value === "" && passwordInput.value === "",
    };
  });
  expect(result).toEqual({
    scans: 1,
    option: "Guest (-40 dBm)",
    restoredPassword: "test-password",
    selected: { ssid: "Guest", password: "" },
    forgotten: true,
    empty: true,
  });
});

test("remembers Wi-Fi details and keeps the firmware file control in Developer utilities", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#open-esp32-setup")).toBeEnabled();
  await expect(
    page.locator("#developer-utilities #esp32-firmware-file"),
  ).toHaveCount(1);
  await expect(
    page.locator("#esp32-setup-dialog input[type=file]"),
  ).toHaveCount(0);
  await page.locator("#open-esp32-setup").click();
  await expect(page.locator("#esp32-setup-dialog")).toBeVisible();
  await expect(page.locator("#esp32-wifi-networks")).toBeVisible();
  await page.locator("#esp32-wifi-ssid").fill("Studio test network");
  await page.locator("#esp32-wifi-password").fill("test-only-password");
  await page.locator("#esp32-wifi-password").blur();
  await expect(page.locator("#esp32-wifi-storage-status")).toHaveText(
    "Wi-Fi details saved on this computer.",
  );
  await page.locator("#close-esp32-setup").click();
  await page.reload();
  await expect(page.locator("#open-esp32-setup")).toBeEnabled();
  await page.locator("#open-esp32-setup").click();
  await expect(page.locator("#esp32-wifi-ssid")).toHaveValue(
    "Studio test network",
  );
  await expect(page.locator("#esp32-wifi-password")).toHaveValue(
    "test-only-password",
  );
  await page.locator("#esp32-wifi-forget").click();
  await expect(page.locator("#esp32-wifi-storage-status")).toHaveText(
    "Saved Wi-Fi details removed.",
  );
  await page.locator("#close-esp32-setup").click();
  await page.reload();
  await expect(page.locator("#open-esp32-setup")).toBeEnabled();
  await page.locator("#open-esp32-setup").click();
  await expect(page.locator("#esp32-wifi-ssid")).toHaveValue("");
  await expect(page.locator("#esp32-wifi-password")).toHaveValue("");
});
