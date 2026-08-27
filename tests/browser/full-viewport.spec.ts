import { expect, test, type Page } from "@playwright/test";

const PROJECT_URL =
  "/?sculptureJson=.%2Fsculptures%2Fstructural-three-panel-trail%2Fsculpture.json";

async function cameraFit(page: Page): Promise<{
  layout: string;
  aspect: number;
  radius: number;
  distance: number;
}> {
  const value = await page.locator("#viewer").getAttribute("data-camera-fit");
  if (!value) throw new Error("The viewer did not record its initial camera fit.");
  const [layout = "", aspect = "", radius = "", distance = ""] = value.split(",");
  return {
    layout,
    aspect: Number(aspect),
    radius: Number(radius),
    distance: Number(distance),
  };
}

test("uses the full screen and fits the initial desktop and mobile canvases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(PROJECT_URL);
  await expect(page.locator("#viewer")).toHaveAttribute("data-camera-fit", /side-panel/);
  await expect(page.locator(".topbar, .brand")).toHaveCount(0);

  const desktopBox = await page.locator("#viewer").boundingBox();
  if (!desktopBox) throw new Error("The desktop viewer has no bounds.");
  expect(desktopBox.y).toBe(0);
  expect(desktopBox.height).toBe(700);
  const desktopFit = await cameraFit(page);
  expect(desktopFit.layout).toBe("side-panel");
  expect(desktopFit.aspect).toBeCloseTo(desktopBox.width / desktopBox.height, 4);
  expect(desktopFit.distance / desktopFit.radius).toBeGreaterThan(4.5);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#viewer")).toHaveAttribute("data-camera-fit", /stacked/);
  const mobileBox = await page.locator("#viewer").boundingBox();
  if (!mobileBox) throw new Error("The mobile viewer has no bounds.");
  expect(mobileBox.y).toBe(0);
  expect(mobileBox.width).toBe(390);
  expect(mobileBox.height).toBeCloseTo(844 * 0.62, 0);
  const mobileFit = await cameraFit(page);
  expect(mobileFit.layout).toBe("stacked");
  expect(mobileFit.aspect).toBeCloseTo(mobileBox.width / mobileBox.height, 3);
  expect(mobileFit.distance / mobileFit.radius).toBeCloseTo(3.27, 1);
});
