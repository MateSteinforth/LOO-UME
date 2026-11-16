import { expect, it } from "vitest";
import {
  assertEquatorFirmware,
  remapStateToLiveTables,
} from "../web/src/Esp32Setup.ts";

it("requires a matching shared renderer and coordinate table before saving", () => {
  const hash = "a".repeat(64);
  const info = {
    um: [32],
    equatorWave: {
      renderer: "equator-wave-v1",
      mappingSha256: hash,
      ledCount: 2624,
    },
  };
  expect(() => assertEquatorFirmware(info, hash, 2624)).not.toThrow();
  for (const value of [
    null,
    {},
    { ...info, um: [] },
    {
      ...info,
      equatorWave: { ...info.equatorWave, mappingSha256: "b".repeat(64) },
    },
  ]) {
    expect(() => assertEquatorFirmware(value, hash, 2624)).toThrow(
      "same sculpture coordinates",
    );
  }
  expect(() => assertEquatorFirmware(info, undefined, 2624)).toThrow();
  expect(() => assertEquatorFirmware(info, hash, 64)).toThrow();
});

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
