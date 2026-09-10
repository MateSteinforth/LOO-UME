import { expect, it } from "vitest";
import { remapStateToLiveTables } from "../web/src/Esp32Setup.ts";

it("resolves the custom effect name before sending a standalone state", () => {
  const payload = {
    sourceFingerprint: "test",
    sourceRevision: 1,
    config: {},
    expectedLedCount: 2624,
    expectedEffectName: "Equator Wave",
    expectedPaletteName: "Default",
    state: { seg: { fx: 1000, pal: 0 } },
  };
  expect(() => remapStateToLiveTables(payload, ["Solid"], ["Default"])).toThrow(
    "does not match",
  );
  remapStateToLiveTables(payload, ["Solid", "Equator Wave"], ["Default"]);
  expect(payload.state.seg.fx).toBe(1);
});
