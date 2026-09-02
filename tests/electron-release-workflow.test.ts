import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Electron Mac release routing", () => {
  it("publishes Electron as the stable free Mac download and keeps the old launcher manual", async () => {
    const [electronWorkflow, launcherWorkflow, readme] = await Promise.all([
      readFile(".github/workflows/electron-macos-release.yml", "utf8"),
      readFile(".github/workflows/macos-launcher-release.yml", "utf8"),
      readFile("README.md", "utf8"),
    ]);
    expect(electronWorkflow).toContain("branches:\n      - main");
    expect(electronWorkflow).toContain('paths-ignore:\n      - "**/*.md"\n      - "tests/**"');
    expect(electronWorkflow).toContain("release_tag=electron-macos-unsigned");
    expect(electronWorkflow).toContain("LOO-UME-Electron-universal.dmg");
    expect(electronWorkflow).toContain("--prerelease");
    expect(electronWorkflow).toContain("This prerelease is not an automatic-update feed.");
    const unsignedPublisher = electronWorkflow
      .split("\n  publish-unsigned:")[1]!
      .split("\n  publish:")[0]!;
    expect(unsignedPublisher).not.toContain("latest-mac.yml");
    expect(unsignedPublisher).not.toContain(".blockmap");
    expect(launcherWorkflow).not.toContain("branches:\n      - main");
    expect(launcherWorkflow).toContain('tags:\n      - "mac-launcher-v*"');
    expect(readme).toContain(
      "releases/download/electron-macos-unsigned/LOO-UME-Electron-universal.dmg",
    );
    expect(readme).toContain("Legacy browser launcher");
  });
});
