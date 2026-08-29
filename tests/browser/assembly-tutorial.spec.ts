import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("loads the populated 41-panel sculpture by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await expect(page.locator("#sculpture-select")).toHaveValue(
    "./sculptures/rhombicosidodecahedron/sculpture.json",
  );
  await expect(page.locator("#led-count")).toHaveValue("2624");
  await expect(page.locator(".output-layer-toggle")).toHaveCount(0);
  const viewSection = page.locator(".control-section").filter({
    has: page.locator("#wiring-layer-controls"),
  });
  await expect(viewSection.locator(".section-heading > span")).toHaveText("View");
  await expect(viewSection.locator("#display-mode")).toBeVisible();
  await expect(viewSection.locator("#panel-transform-mode")).toHaveAttribute(
    "data-mode",
    "surface",
  );
  await expect(viewSection.locator("[data-transform-icon='plane'] svg")).toBeVisible();
  await expect(viewSection.locator("[data-transform-icon='world'] svg")).toBeVisible();
  const placementColumns = await page.locator("#automatic-panel-placement-controls")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(placementColumns).toBe(2);
  await expect(page.locator(".toolbox-heading strong")).toHaveText([
    "Shape",
    "Fixtures",
    "Mapping",
    "Fabrication",
    "Build Hardware",
    "Export",
  ]);
  await expect(viewSection.locator("#effect")).toBeVisible();
  await expect(viewSection.locator("#palette")).toBeVisible();
  await expect(page.locator("[data-toolbox='build-hardware'] #open-esp32-setup"))
    .toBeVisible();
  await expect(page.locator("[data-toolbox='export'] #save-project"))
    .toHaveText("Export project ZIP");
  await expect(page.locator("[data-toolbox='shape'] #load-design-surface"))
    .toHaveText("GLB");
  await expect(page.locator("[data-toolbox='mapping'] #download-madmapper-package"))
    .toBeVisible();
  const overflowingSteps = await page.locator(".toolbox-section").evaluateAll((steps) =>
    steps
      .filter((step) => step.scrollWidth > step.clientWidth)
      .map((step) => step.getAttribute("data-toolbox")),
  );
  expect(overflowingSteps).toEqual([]);
});

test("isolates and steps through a Schema 2 data chain", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fstructural-three-panel-trail%2Fsculpture.json",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  await expect(page.locator("#assembly-tutorial-chain")).toHaveCount(0);
  await expect(page.locator("#assembly-tutorial-overview")).toHaveCount(0);
  await expect(page.locator("[data-toolbox='build-hardware'] #assembly-tutorial-section"))
    .toBeVisible();
  await expect(page.locator(".view-section #wiring-layer-controls")).toBeVisible();
  await expect(page.locator("#assembly-tutorial-warning")).toHaveText(
    "DRAFT ROUTE — regenerate mapping/wiring before physical assembly.",
  );

  await page.locator("#assembly-tutorial-start").click();
  await expect(page.locator("#assembly-tutorial-step")).toHaveText(
    "Spatial trail output · wire 1 / 3",
  );
  await expect(page.locator(".panel-label:visible")).toHaveCount(3);
  await expect(page.locator(".wiring-controller-label:visible")).toHaveText(
    "Controller",
  );
  await expect(page.locator(".wiring-controller-pin-label:visible")).toHaveText(
    "Output 1",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "3",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-active-connection",
    "0",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-muted-connections",
    "2",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-active-material",
    "ff2435,1,false,true",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-muted-material",
    "8290a3,0.62,true,false",
  );
  await page.locator("#connector-layer").uncheck();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-connector-layer-visible",
    "false",
  );
  await page.locator("#wiring-layer").uncheck();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-wiring-layer-visible",
    "false",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "0",
  );
  await page.locator("#connector-layer").check();
  await page.locator("#wiring-layer").check();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "3",
  );
  await expect(page.locator(".assembly-cable-label")).toHaveCount(0);
  await expect(page.locator("#assembly-tutorial-previous-chain")).toBeDisabled();
  await expect(page.locator("#assembly-tutorial-next-chain")).toBeDisabled();
  await expect(page.locator(".panel-label:visible")).toHaveText([
    "P-01",
    "P-02",
    "P-03",
  ]);

  await expect(page.locator("#assembly-tutorial-instruction")).toHaveText(
    "Controller output 1 (GPIO unassigned) → P-02 DIN (top-right, back view)",
  );
  await page.locator("#assembly-tutorial-next-wire").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-instruction")).toHaveText(
    /P-02 DOUT.*→.*DIN/,
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "3",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-active-connection",
    "1",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-muted-connections",
    "2",
  );
  await page.locator("#assembly-tutorial-previous-wire").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-step")).toHaveText(
    "Spatial trail output · wire 1 / 3",
  );

  await page.locator("#assembly-tutorial-next-wire").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#assembly-tutorial-instruction")).toContainText(
    "P-02 DOUT",
  );
  await expect(page.locator(".panel-label--tutorial-active:visible")).toHaveCount(2);
  await page.locator("#panel-transform-mode").click();
  await page.locator(".route-panel").first().evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page.locator(".panel-delete-billboard")).toHaveCount(0);
  await page.locator("#auto-rotate").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#connector-layer").uncheck();
  await page.locator("#wiring-layer").uncheck();

  await page.locator("#assembly-tutorial-exit").click();
  await expect(page.locator("#assembly-tutorial-controls")).toBeHidden();
  await expect(page.locator(".assembly-cable-label")).toHaveCount(0);
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-auto-rotate",
    "false",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-wiring-restored-connections",
    "3",
  );
  await expect(page.locator("#connector-layer")).not.toBeChecked();
  await expect(page.locator("#wiring-layer")).not.toBeChecked();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-connector-layer-visible",
    "false",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-wiring-layer-visible",
    "false",
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("uses the chain buttons and skips empty outputs", async ({ page }) => {
  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fstructural-three-panel-trail%2Fsculpture.json",
  );
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  const project = JSON.parse(await readFile(
    "sculptures/structural-three-panel-trail/sculpture.json",
    "utf8",
  )) as {
    wiring: {
      chainLengths: number[];
      outputs: Array<{
        outputIndex: number;
        label: string;
        gpio: number | null;
        color: string;
      }>;
    };
  };
  project.wiring.chainLengths = [0, 1, 0, 1, 1, 0];
  project.wiring.outputs = [
    { outputIndex: 0, label: "Empty first", gpio: null, color: "#36e0d0" },
    { outputIndex: 1, label: "Output 2", gpio: null, color: "#ff9d5c" },
    { outputIndex: 2, label: "Empty middle", gpio: null, color: "#a78bfa" },
    { outputIndex: 3, label: "Output 4", gpio: null, color: "#f472b6" },
    { outputIndex: 4, label: "Output 5", gpio: null, color: "#facc15" },
    { outputIndex: 5, label: "Empty last", gpio: null, color: "#60a5fa" },
  ];
  await page.locator("#project-file").setInputFiles({
    name: "multi-output-tutorial.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".output-layer-toggle")).toHaveCount(0);
  await page.locator("#assembly-tutorial-start").click();
  await expect(page.locator("#assembly-tutorial-step")).toContainText("Output 2");
  await page.locator("#assembly-tutorial-next-wire").click();
  await expect(page.locator("#assembly-tutorial-step")).toContainText("Output 4");
  await page.locator("#assembly-tutorial-previous-wire").click();
  await expect(page.locator("#assembly-tutorial-step")).toContainText("Output 2");
  await page.locator("#assembly-tutorial-next-chain").click();
  await expect(page.locator("#assembly-tutorial-step")).toContainText("Output 4");
  await expect(page.locator(".panel-label:visible")).toHaveCount(1);
  await page.locator("#assembly-tutorial-next-chain").click();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-visible-connections",
    "1",
  );
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-tutorial-muted-connections",
    "0",
  );
  await expect(page.locator("#assembly-tutorial-step")).toContainText(
    "Output 5",
  );
  await page.locator("#assembly-tutorial-exit").click();
  await expect(page.locator("#assembly-tutorial-controls")).toBeHidden();
});

test("restores a surface-backed viewport after the tutorial", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Fpose-only-rhombicosidodecahedron%2Fsculpture.json",
  );
  await expect(page.locator("#pipeline-status")).toContainText("watertight");
  await page.locator("#advanced-tools").evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await expect(page.locator("#automatically-place-panels")).toBeEnabled();
  await page.locator("#automatic-panel-count").fill("3");
  await page.locator("#automatically-place-panels").click();
  await expect(page.locator("#assembly-tutorial-start")).toBeEnabled();
  await page.locator("#display-mode").selectOption("physical-index");
  const autoRotate = page.locator("#auto-rotate");
  if (await autoRotate.isChecked()) await autoRotate.uncheck();
  const beforeGrid = await page.locator("#viewer").getAttribute(
    "data-grid-bounds",
  );
  expect(beforeGrid).toBeTruthy();

  await page.locator("#assembly-tutorial-start").click();
  await page.locator("#assembly-tutorial-exit").click();
  await expect(page.locator("#viewer")).toHaveAttribute(
    "data-grid-bounds",
    beforeGrid!,
  );
});
