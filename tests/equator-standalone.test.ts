import { expect, it } from "vitest";
import { GLITCH_AUDIO_EFFECTS } from "../src/effects/AudioArtEffects.ts";
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

it("requires the new renderer for all three monochrome effects", () => {
  const hash = "a".repeat(64);
  const renderer = {
    renderer: "glitch-audio-v1",
    mappingSha256: hash,
    ledCount: 2624,
  };
  for (const effect of GLITCH_AUDIO_EFFECTS) {
    expect(() =>
      assertEquatorFirmware(
        { um: [32], audioArt: renderer },
        hash,
        2624,
        effect.name,
      ),
    ).not.toThrow();
    expect(() =>
      assertEquatorFirmware(
        { um: [32], equatorWave: renderer },
        hash,
        2624,
        effect.name,
      ),
    ).toThrow("same sculpture coordinates");
    expect(() =>
      assertEquatorFirmware(
        { um: [32], audioArt: { ...renderer, mappingSha256: "b".repeat(64) } },
        hash,
        2624,
        effect.name,
      ),
    ).toThrow();
    const payload = {
      sourceFingerprint: "test",
      sourceRevision: 1,
      config: {},
      expectedLedCount: 2624,
      expectedEffectName: effect.name,
      expectedPaletteName: "Default",
      state: { seg: { fx: effect.id, pal: 0 } },
    };
    remapStateToLiveTables(payload, ["Solid", effect.name], ["Default"]);
    expect(payload.state.seg.fx).toBe(1);
  }
});
