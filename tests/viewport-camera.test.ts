import { describe, expect, it } from "vitest";
import {
  cameraClippingRange,
  viewportFitDistance,
} from "../web/src/ViewportCamera.ts";

describe("viewport camera policy", () => {
  it("keeps mobile framing and adds desktop breathing room", () => {
    const mobile = viewportFitDistance(150, 40, 0.8, false);
    const desktop = viewportFitDistance(150, 40, 1.4, true);

    expect(mobile).toBeCloseTo(491.2, 1);
    expect(desktop).toBeGreaterThan(mobile * 1.19);
  });

  it("fits the limiting horizontal FOV beside the desktop controls", () => {
    const wide = viewportFitDistance(150, 40, 1.4, true);
    const narrow = viewportFitDistance(150, 40, 0.64, true);

    expect(narrow).toBeGreaterThan(wide * 1.45);
  });

  it("uses a tight depth range at normal and distant zoom", () => {
    const normal = cameraClippingRange(588, 150);
    const distant = cameraClippingRange(10_000, 150);

    expect(normal.near).toBeCloseTo(14.7, 5);
    expect(normal.far / normal.near).toBeLessThan(100);
    expect(distant.near).toBe(250);
    expect(distant.far / distant.near).toBeLessThan(50);
  });

  it("keeps a close near plane when the user zooms into the sculpture", () => {
    const close = cameraClippingRange(80, 150);

    expect(close.near).toBe(0.05);
    expect(close.far).toBe(530);
  });
});
