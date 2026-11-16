import { describe, expect, it } from "vitest";
import { audioEffectsFromDevice } from "../web/src/AudioEffects.ts";

describe("connected WLED audio effects", () => {
  const names = ["Solid", "Pixels", "Freqwave", "2D GEQ", "RSVD", "Plasmoid"];
  const data = [
    "",
    "Fade,Count;!;!;1v;ix=64",
    "Speed,Sound;!;!;01f;sx=90,ix=120",
    "!;!;!;2f",
    "!;!;!;1f",
    "!;!;!;01v;sx=999,ix=oops",
  ];
  it("uses live indices and includes only available 1D microphone effects", () => {
    expect(audioEffectsFromDevice({ um: [32] }, names, data)).toMatchObject([
      { id: 1, name: "Pixels", speed: 128, intensity: 64 },
      { id: 2, name: "Freqwave", speed: 90, intensity: 120 },
      { id: 5, name: "Plasmoid", speed: 128, intensity: 128 },
    ]);
  });
  it("does not offer simulated audio effects when the microphone usermod is absent", () => {
    expect(audioEffectsFromDevice({ um: [] }, names, data)).toEqual([]);
    expect(audioEffectsFromDevice(null, names, data)).toEqual([]);
  });
  it("ignores missing, malformed and 2D-only metadata", () => {
    expect(
      audioEffectsFromDevice({ um: [32] }, names, [null, {}, "", "!;!;!;2f"]),
    ).toEqual([]);
    expect(audioEffectsFromDevice({ um: [32] }, {}, data)).toEqual([]);
  });
  it("resets hidden controls and uses firmware-specific defaults without changing mapping", () => {
    expect(
      audioEffectsFromDevice(
        { um: [32] },
        ["Ripple Peak"],
        ["!;!;!;1v;c2=0,m12=3,si=1,o1=1"],
      )[0]?.controls,
    ).toEqual({ c1: 128, c2: 0, c3: 16, o1: true, o2: false, o3: false });
  });
});
