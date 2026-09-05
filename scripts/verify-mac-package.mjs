import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { _electron as electron } from "playwright";

assert.equal(process.platform, "darwin", "Run this check on macOS.");
assert.equal(process.arch, "arm64", "Run this check on Apple Silicon.");
const applicationPath = process.argv[2];
assert.ok(applicationPath, "Supply the packaged application path.");
const userData = await mkdtemp(join(tmpdir(), "loo-mac-check-"));
let application;
try {
  application = await electron.launch({
    executablePath: resolve(applicationPath, "Contents/MacOS/LOO UME"),
    env: {
      ...process.env,
      LOO_UME_LOCAL_ELECTRON_REVIEW: "1",
      LOO_UME_LOCAL_ELECTRON_REVIEW_DATA: userData,
    },
    timeout: 60_000,
  });
  const page = await application.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(new URL(page.url()).hostname, "127.0.0.1");
  assert.deepEqual(errors, []);
  console.log("The packaged Apple Silicon editor opened successfully.");
} finally {
  await application?.close();
  await rm(userData, { recursive: true, force: true });
}
