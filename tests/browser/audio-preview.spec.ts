import { expect, test } from "@playwright/test";

test("previews the equatorial effect and releases microphone capture", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let stops = 0;
    Object.defineProperty(window, "audioTestStops", { get: () => stops });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 100;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stops++;
            stop();
            oscillator.stop();
            void context.close();
          };
        }
        return destination.stream;
      },
    });
  });
  await page.goto(
    "/?sculptureJson=.%2Fsculptures%2Frhombicosidodecahedron%2Fsculpture.json",
  );
  await expect(page.locator("#effect option").last()).toHaveText(
    "Equator Wave",
  );
  await page.locator("#effect").selectOption({ label: "Equator Wave" });
  await expect(page.locator("#palette")).toBeDisabled();
  await page.locator("#audio-preview-source").selectOption("demo");
  await expect(page.locator("#audio-preview-status")).toContainText(
    "Demo beat",
  );
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLMeterElement>("#audio-preview-bass")?.value ??
        0) > 0,
  );
  await page.screenshot({ path: "test-results/equator-wave-preview.png" });
  await page.locator("#audio-preview-source").selectOption("microphone");
  await expect(page.locator("#audio-preview-status")).toContainText(
    "microphone active",
  );
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLMeterElement>("#audio-preview-bass")?.value ??
        0) > 0,
  );
  await page.locator("#audio-preview-source").selectOption("off");
  await expect(page.locator("#audio-preview-status")).toHaveText(
    "Audio input is off.",
  );
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "audioTestStops") as number),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page
        .locator("#audio-preview-bass")
        .evaluate((meter: HTMLMeterElement) => meter.value),
    )
    .toBe(0);
  await page.locator("#effect").selectOption("8");
  await expect(page.locator("#palette")).toBeEnabled();
});

test("reports denied microphone access and allows a demo retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#effect option").last()).toHaveText(
    "Equator Wave",
  );
  await page.locator("#audio-preview-source").selectOption("microphone");
  await expect(page.locator("#audio-preview-status")).toContainText(
    "Microphone unavailable",
  );
  await expect(page.locator("#audio-preview-source")).toHaveValue("off");
  await page.locator("#audio-preview-source").selectOption("demo");
  await expect(page.locator("#audio-preview-status")).toContainText(
    "Demo beat",
  );
});
