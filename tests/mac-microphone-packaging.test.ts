import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reviewEntitlements = readFileSync(
  "electron/entitlements.review.mac.plist",
  "utf8",
);
const packageVerifier = readFileSync("scripts/verify-mac-package.mjs", "utf8");

describe("macOS microphone packaging", () => {
  it("keeps microphone capture in the review entitlement override", () => {
    expect(reviewEntitlements).toContain(
      "com.apple.security.device.audio-input",
    );
  });

  it("checks the signed entitlement and usage description in the package", () => {
    expect(packageVerifier).toContain("--entitlements");
    expect(packageVerifier).toContain("device\\.audio-input");
    expect(packageVerifier).toContain("NSMicrophoneUsageDescription");
  });
});
