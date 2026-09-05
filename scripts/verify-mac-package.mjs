import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";

assert.equal(process.platform, "darwin", "Run this check on macOS.");
assert.equal(process.arch, "arm64", "Run this check on Apple Silicon.");
const applicationPath = process.argv[2];
assert.ok(applicationPath, "Supply the packaged application path.");
const userData = await mkdtemp(join(tmpdir(), "loo-mac-check-"));
let application;
const launch = () =>
  electron.launch({
    executablePath: resolve(applicationPath, "Contents/MacOS/LOO UME"),
    env: {
      ...process.env,
      LOO_UME_LOCAL_ELECTRON_REVIEW: "1",
      LOO_UME_LOCAL_ELECTRON_REVIEW_DATA: userData,
    },
    timeout: 60_000,
  });
try {
  application = await launch();
  const page = await application.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("canvas")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(new URL(page.url()).hostname, "127.0.0.1");
  await page.locator("#developer-utilities").evaluate((element) => {
    element.open = true;
  });
  const gpioInputs = page.locator("#output-gpio-inputs input");
  await expect(gpioInputs).toHaveCount(4);
  for (const [index, gpio] of [16, 17, 21, 22].entries()) {
    await gpioInputs.nth(index).fill(String(gpio));
  }
  await page.locator("#apply-output-gpios").click();
  await expect(page.locator("#wiring-optimization-summary")).toContainText(
    "GPIO 16/17/21/22",
  );
  const enabled = await page.evaluate(async () => {
    const response = await fetch("/api/esp32-reconnect-authorization", {
      method: "POST",
      headers: { "X-LOO-UME-ESP32": "1" },
    });
    if (!response.ok) throw new Error("Reconnect authorization failed.");
    return (await response.json()).enabled;
  });
  assert.equal(enabled, true);
  assert.deepEqual(errors, []);
  await application.close();
  application = undefined;
  application = await launch();
  const reopenedPage = await application.firstWindow();
  await reopenedPage.locator("#viewer canvas").waitFor({ state: "visible" });
  assert.equal(
    await reopenedPage.evaluate(async () => {
      const response = await fetch("/api/esp32-reconnect-authorization", {
        headers: { "X-LOO-UME-ESP32": "1" },
      });
      if (!response.ok) throw new Error("Reconnect authorization read failed.");
      return (await response.json()).enabled;
    }),
    true,
  );
  console.log(
    "The packaged Apple Silicon editor passed launch, GPIO, and reconnect persistence checks.",
  );
} finally {
  await application?.close();
  await rm(userData, { recursive: true, force: true });
}
