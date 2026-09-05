import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createUnsignedUpdateMetadata,
  UNSIGNED_DMG_URL,
} from "../scripts/create-electron-unsigned-update.ts";

describe("Electron Mac release routing", () => {
  it("publishes Electron as the stable free Mac download and keeps the launcher tag-only", async () => {
    const [electronWorkflow, launcherWorkflow, readme] = await Promise.all([
      readFile(".github/workflows/electron-macos-release.yml", "utf8"),
      readFile(".github/workflows/macos-launcher-release.yml", "utf8"),
      readFile("README.md", "utf8"),
    ]);
    expect(electronWorkflow).toContain("branches:\n      - main");
    expect(electronWorkflow).toContain(
      'paths-ignore:\n      - "**/*.md"\n      - "tests/**"',
    );
    expect(electronWorkflow).toContain("release_tag=electron-macos-unsigned");
    expect(electronWorkflow).toContain("LOO-UME-Electron-arm64.dmg");
    expect(electronWorkflow).toContain("--prerelease");
    expect(electronWorkflow).toContain(
      "scripts/create-electron-unsigned-update.ts",
    );
    expect(electronWorkflow).toContain("release/unsigned-update.json");
    expect(electronWorkflow).toContain("esp32-firmware-improv-rmt4-v1");
    expect(electronWorkflow).toContain("scripts/verify-packaged-firmware.mjs");
    expect(electronWorkflow).toContain(
      "Contents/Resources/app/build/firmware/wled-orbital-esp32dev-full-flash.bin",
    );
    expect(electronWorkflow).toContain("replacement remains manual");
    const unsignedPublisher = electronWorkflow
      .split("\n  publish-unsigned:")[1]!
      .split("\n  publish:")[0]!;
    expect(unsignedPublisher).not.toContain("latest-mac.yml");
    expect(unsignedPublisher).not.toContain(".blockmap");
    expect(unsignedPublisher).toContain("release/unsigned-update.json");
    expect(launcherWorkflow).not.toContain("branches:\n      - main");
    expect(launcherWorkflow).toContain('tags:\n      - "mac-launcher-v*"');
    expect(readme).toContain(
      "releases/download/electron-macos-unsigned/LOO-UME-Electron-arm64.dmg",
    );
    expect(readme).toContain("[Development](docs/DEVELOPMENT.md)");
  });

  it("packages the receipt-bound complete ESP32 image", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      build: { extraResources: Array<{ from: string; to: string }> };
    };
    expect(packageJson.build.extraResources).toContainEqual({
      from: "build/firmware/wled-orbital-esp32dev-full-flash.bin",
      to: "app/build/firmware/wled-orbital-esp32dev-full-flash.bin",
    });
  });

  it("binds the free update notice to the exact published DMG", async () => {
    const releaseDirectory = await mkdtemp(join(tmpdir(), "loo-ume-update-"));
    try {
      const dmg = Uint8Array.from([1, 2, 3, 4]);
      await writeFile(
        join(releaseDirectory, "LOO-UME-Electron-arm64.dmg"),
        dmg,
      );
      const metadata = await createUnsignedUpdateMetadata(
        releaseDirectory,
        "0.1.123",
        "a".repeat(40),
      );
      expect(metadata).toMatchObject({
        schemaVersion: "1.0.0",
        version: "0.1.123",
        commit: "a".repeat(40),
        downloadUrl: UNSIGNED_DMG_URL,
        fileName: "LOO-UME-Electron-arm64.dmg",
        byteLength: 4,
      });
      expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(
        JSON.parse(
          await readFile(
            join(releaseDirectory, "unsigned-update.json"),
            "utf8",
          ),
        ),
      ).toEqual(metadata);
    } finally {
      await rm(releaseDirectory, { recursive: true, force: true });
    }
  });
});
