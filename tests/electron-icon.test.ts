import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("Electron Mac icon", () => {
  it("renders transparent corners without Quick Look", async () => {
    const output = await mkdtemp(join(tmpdir(), "loo-ume-icon-test-"));
    await execFileAsync(process.execPath, [
      "scripts/render-electron-mac-icon.mjs",
      "macos/AppIcon.svg",
      output,
    ]);
    const icon = join(output, "icon_512x512@2x.png");
    const { data, info } = await sharp(icon)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 1024, height: 1024, channels: 4 });
    expect(data[3]).toBe(0);
    expect(data[(512 * 1024 + 512) * 4 + 3]).toBe(255);

    const buildScript = await readFile("scripts/build-electron-mac-icon.sh", "utf8");
    expect(buildScript).toContain("render-electron-mac-icon.mjs");
    expect(buildScript).not.toContain("qlmanage");
    expect(buildScript).not.toContain("sips");
  });
});
