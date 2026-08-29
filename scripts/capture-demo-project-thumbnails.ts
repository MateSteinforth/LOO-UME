import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

interface SculptureRegistry {
  sculptures: Array<{ id: string; name: string; source: string }>;
}

const rootDirectory = process.cwd();
const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4174/");
const registry = JSON.parse(await readFile(
  resolve(rootDirectory, "sculptures/manifest.json"),
  "utf8",
)) as SculptureRegistry;
const outputDirectory = resolve(rootDirectory, "projects/thumbnails");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const entry of registry.sculptures) {
    const url = new URL(baseUrl);
    url.searchParams.set("sculptureJson", entry.source);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.locator("#current-project-name").waitFor({ state: "visible" });
    await page.locator("#current-project-name").filter({ hasText: entry.name })
      .waitFor();
    await page.waitForFunction(() =>
      typeof (window as unknown as {
        __looUmeCaptureProjectThumbnail?: unknown;
      }).__looUmeCaptureProjectThumbnail === "function"
    );
    const values = await page.evaluate(async () => {
      const capture = (window as unknown as {
        __looUmeCaptureProjectThumbnail: () => Promise<number[]>;
      }).__looUmeCaptureProjectThumbnail;
      return capture();
    });
    const bytes = Uint8Array.from(values);
    if (
      bytes.byteLength < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e || bytes[3] !== 0x47
    ) throw new Error(`Viewport capture for ${entry.id} is not a PNG.`);
    await writeFile(resolve(outputDirectory, `${entry.id}.png`), bytes);
    console.log(`Captured ${entry.id} (${bytes.byteLength} bytes).`);
  }
} finally {
  await browser.close();
}

console.log(
  "Captured framed demo thumbnails. Stop the preview, then run npm run generate:demo-projects.",
);
