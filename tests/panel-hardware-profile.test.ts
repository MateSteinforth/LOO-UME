import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  panelBackViewPointToOutwardPoseLocal,
  parsePanelHardwareProfile,
} from "../src/sculpture/Definition.ts";

function loadProfile() {
  return parsePanelHardwareProfile(JSON.parse(readFileSync(
    "catalog/panels/ws2812b-8x8-66x65.json",
    "utf8",
  )));
}

describe("panel hardware profile", () => {
  it("mirrors only back-view X when hardware enters the outward pose", () => {
    expect(panelBackViewPointToOutwardPoseLocal([-25, -24.5]))
      .toEqual([25, -24.5]);
    expect(panelBackViewPointToOutwardPoseLocal([25, 24.5]))
      .toEqual([-25, 24.5]);
  });

  it("preserves the approved mechanical, connector, and power facts", () => {
    const profile = loadProfile();

    expect(profile.dimensions).toEqual({
      width: 66,
      height: 65,
      thickness: 0.8,
    });
    expect(profile.dataConnectors).toMatchObject({
      referenceView: "back",
      orientationReference: "three-mounting-holes-vertical",
      cornerAssignmentStatus: "measured",
      dinCorner: "bottom-left",
      doutCorner: "top-right",
      padPositionStatus: "unknown",
    });
    expect(profile.mounting.holes).toMatchObject([
      { id: "top-left", mechanicalUse: "eligible" },
      { id: "middle-left", mechanicalUse: "eligible" },
      { id: "bottom-left", mechanicalUse: "blocked", blockedBy: "DIN" },
      { id: "top-right", mechanicalUse: "blocked", blockedBy: "DOUT" },
      { id: "middle-right", mechanicalUse: "eligible" },
      { id: "bottom-right", mechanicalUse: "eligible" },
    ]);
    expect(profile.mounting.physicalCorrections).toMatchObject({
      holeEdge: 0.2,
      surfaceFlush: 0.5,
      status: "measured",
    });
    expect(profile.power).toMatchObject({
      worstCaseCurrentPerPixel: 0.06,
      worstCaseCurrentPerPanel: 3.84,
    });
  });

  it("rejects loss of the measured physical corrections", () => {
    const profile = loadProfile();
    profile.mounting.physicalCorrections.status = "provisional" as "measured";

    expect(() => parsePanelHardwareProfile(profile)).toThrow(
      "must remain measured",
    );
  });

  it("rejects use of a connector-blocked mounting hole", () => {
    const profile = loadProfile();
    profile.mounting.holes.find(
      (hole) => hole.id === "bottom-left",
    )!.mechanicalUse = "eligible";

    expect(() => parsePanelHardwareProfile(profile)).toThrow(
      "Eligible mounting holes cannot be marked",
    );
  });

  it("rejects an inconsistent per-panel current", () => {
    const profile = loadProfile();
    profile.power.worstCaseCurrentPerPanel = 3.8;

    expect(() => parsePanelHardwareProfile(profile)).toThrow(
      "must equal pixel count",
    );
  });

  it("ships a parseable panel-profile JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync("schemas/panel-profile.schema.json", "utf8"),
    ) as { $schema: string; $id: string };

    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toContain("panel-profile.schema.json");
  });
});
