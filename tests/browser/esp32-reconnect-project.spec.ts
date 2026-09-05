import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parsePanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import { setWiringOutputGpios } from "../../src/sculpture/SculptureEditor.ts";
import { createProjectPackageZip } from "../../web/src/ProjectPackage.ts";

test("restores replacement GPIOs before automatic device discovery", async ({
  page,
}) => {
  const definition = setWiringOutputGpios(
    parsePanelAssemblyDefinition(
      JSON.parse(
        await readFile(
          "sculptures/rhombicosidodecahedron/sculpture.json",
          "utf8",
        ),
      ),
    ),
    [16, 17, 21, 22],
  );
  definition.name = "Saved ESP32 replacement outputs";
  const bytes = createProjectPackageZip(definition, new Map());
  let snapshotReturned = false;
  let discoveryStarted = false;
  await page.route("**/api/esp32-reconnect-project", async (route) => {
    await route.fulfill({
      contentType: "application/zip",
      body: Buffer.from(bytes),
    });
    snapshotReturned = true;
  });
  await page.route("**/api/esp32-reconnect-authorization", async (route) => {
    await route.fulfill({ json: { schemaVersion: "1.0.0", enabled: true } });
  });
  await page.route("**/api/esp32-device**", async (route) => {
    expect(snapshotReturned).toBe(true);
    discoveryStarted = true;
    await route.fulfill({ status: 503, body: "No test controller." });
  });
  await page.goto("/");
  await expect(page.locator("#current-project-name")).toHaveText(
    definition.name,
  );
  await expect(page.locator("#output-gpio-inputs input")).toHaveCount(4);
  expect(
    await page
      .locator("#output-gpio-inputs input")
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLInputElement).value),
      ),
  ).toEqual(["16", "17", "21", "22"]);
  await expect.poll(() => discoveryStarted).toBe(true);
  await page.reload();
  await expect(page.locator("#current-project-name")).toHaveText(
    definition.name,
  );
  await expect(page.locator("#output-gpio-inputs input").nth(2)).toHaveValue(
    "21",
  );

  await page.goto(
    "/?sculptureJson=/sculptures/rhombicosidodecahedron/sculpture.json",
  );
  await expect(page.locator("#output-gpio-inputs input").nth(2)).toHaveValue(
    "18",
  );
});

test("keeps the editor usable but stops reconnect when the saved project is invalid", async ({
  page,
}) => {
  let deviceRequests = 0;
  let authorizationRead = false;
  await page.route("**/api/esp32-reconnect-project", async (route) => {
    await route.fulfill({ contentType: "application/zip", body: "invalid" });
  });
  await page.route("**/api/esp32-reconnect-authorization", async (route) => {
    authorizationRead = true;
    await route.fulfill({ json: { schemaVersion: "1.0.0", enabled: true } });
  });
  await page.route("**/api/esp32-device**", async (route) => {
    deviceRequests += 1;
    await route.fulfill({ status: 503 });
  });
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "Automatic reconnect is stopped",
  );
  await expect(page.locator("#output-gpio-inputs input")).toHaveCount(4);
  await expect.poll(() => authorizationRead).toBe(true);
  expect(deviceRequests).toBe(0);
  const definition = parsePanelAssemblyDefinition(
    JSON.parse(
      await readFile(
        "sculptures/rhombicosidodecahedron/sculpture.json",
        "utf8",
      ),
    ),
  );
  await page.locator("#project-file").setInputFiles({
    name: "recovery.loo.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(createProjectPackageZip(definition, new Map())),
  });
  await expect.poll(() => deviceRequests).toBeGreaterThan(0);
});
