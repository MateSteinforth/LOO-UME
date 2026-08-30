import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  panelBackViewPointToOutwardPoseLocal,
  panelConnectorLocalPosition,
  panelEmitterLocalPositions,
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
      orientationReference: "six-holes-three-columns-two-rows",
      cornerAssignmentStatus: "measured",
      dinCorner: "bottom-right",
      doutCorner: "top-left",
      padPositionStatus: "unknown",
    });
    expect(profile.pixelGrid.colorOrder).toEqual({
      status: "measured",
      channelSequence: "GRB",
      wledValue: 0,
      note: expect.stringContaining("2026-08-25"),
    });
    expect(profile.mounting.holes).toMatchObject([
      { id: "top-left", localPosition: [-25, 24.5], mechanicalUse: "blocked", blockedBy: "DOUT" },
      { id: "middle-left", localPosition: [0, 24.5], mechanicalUse: "eligible" },
      { id: "bottom-left", localPosition: [-25, -24.5], mechanicalUse: "eligible" },
      { id: "top-right", localPosition: [25, 24.5], mechanicalUse: "eligible" },
      { id: "middle-right", localPosition: [0, -24.5], mechanicalUse: "eligible" },
      { id: "bottom-right", localPosition: [25, -24.5], mechanicalUse: "blocked", blockedBy: "DIN" },
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
    expect(profile.pixelGrid.provisionalOrder).toMatchObject({
      status: "measured",
      pixelZeroCorner: "bottom-right",
      traversalAxis: "rows",
      lineProgression: "bottom-to-top",
      serpentine: false,
      firstLineDirection: "right-to-left",
    });
  });

  it("matches the printed U-frame and bridge under either allowed half-turn", () => {
    const profile = loadProfile();
    const eligibleBackView = profile.mounting.holes
      .filter((hole) => hole.mechanicalUse === "eligible")
      .map((hole) => hole.localPosition);
    const key = ([x, y]: [number, number]): string => `${x},${y}`;
    const printedPilotSet = [
      [-25, -24.5],
      [0, -24.5],
      [25, 24.5],
      [0, 24.5],
    ] as Array<[number, number]>;

    expect(eligibleBackView.map(key).sort()).toEqual(printedPilotSet.map(key).sort());
    expect(eligibleBackView.map(([x, y]) => key([-x, -y])).sort())
      .toEqual(printedPilotSet.map(key).sort());
  });

  it("rejects a WLED value that contradicts the channel sequence", () => {
    const profile = loadProfile();
    profile.pixelGrid.colorOrder.wledValue = 1;

    expect(() => parsePanelHardwareProfile(profile)).toThrow(
      "color order and WLED value are inconsistent",
    );
  });

  it("normalizes a historical 1.0.0 profile without color evidence", () => {
    const profile = structuredClone(loadProfile());
    delete (profile.pixelGrid as Partial<typeof profile.pixelGrid>).colorOrder;

    expect(parsePanelHardwareProfile(profile).pixelGrid.colorOrder).toEqual({
      status: "provisional",
      channelSequence: "RGB",
      wledValue: 1,
      note: expect.stringContaining("Legacy schema 1.0.0"),
    });
  });

  it("normalizes legacy emitters and connectors without changing their positions", () => {
    const profile = loadProfile();
    const emitters = panelEmitterLocalPositions(profile);

    expect(emitters).toHaveLength(64);
    expect(emitters[0]).toEqual([-25.666666666666664, 25.27777777777778, 1.2]);
    expect(emitters[63]).toEqual([25.666666666666664, -25.27777777777778, 1.2]);
    expect(panelConnectorLocalPosition(profile, 4, "din")).toEqual([-29, -28.5, 0]);
    expect(panelConnectorLocalPosition(profile, 4, "dout")).toEqual([29, 28.5, 0]);
  });

  it("accepts one explicit pose-local emitter and connector position per address", () => {
    const profile = structuredClone(loadProfile());
    profile.pixelGrid.columns = 12;
    profile.pixelGrid.rows = 1;
    profile.pixelGrid.provisionalOrder.pixelZeroCorner = "bottom-right";
    profile.pixelGrid.provisionalOrder.traversalAxis = "rows";
    profile.pixelGrid.provisionalOrder.lineProgression = "bottom-to-top";
    profile.pixelGrid.provisionalOrder.firstLineDirection = "right-to-left";
    profile.pixelGrid.provisionalOrder.serpentine = false;
    profile.pixelGrid.localEmitterPositions = Array.from(
      { length: 12 },
      (_, index) => {
        const radians = -index * Math.PI / 6;
        return [
          Math.cos(radians) * 159,
          Math.sin(radians) * 159,
          0,
        ] as [number, number, number];
      },
    );
    profile.dataConnectors.localPositions = {
      coordinateFrame: "pose-local",
      din: [159, 0, 0],
      dout: profile.pixelGrid.localEmitterPositions[11]!,
    };
    profile.power.worstCaseCurrentPerPanel = 0.72;

    const parsed = parsePanelHardwareProfile(profile);
    expect(panelEmitterLocalPositions(parsed)).toEqual(
      profile.pixelGrid.localEmitterPositions,
    );
    expect(panelConnectorLocalPosition(parsed, 99, "din")).toEqual([159, 0, 0]);
    expect(panelConnectorLocalPosition(parsed, 99, "dout")).toEqual(
      profile.pixelGrid.localEmitterPositions[11],
    );
  });

  it("rejects incomplete or overlapping explicit emitter positions", () => {
    const incomplete = structuredClone(loadProfile());
    incomplete.pixelGrid.localEmitterPositions = [[0, 0, 0]];
    expect(() => parsePanelHardwareProfile(incomplete)).toThrow(
      "one row-major position per grid coordinate",
    );

    const overlapping = structuredClone(loadProfile());
    overlapping.pixelGrid.localEmitterPositions = Array.from(
      { length: 64 },
      () => [0, 0, 0] as [number, number, number],
    );
    expect(() => parsePanelHardwareProfile(overlapping)).toThrow(
      "must be unique",
    );
  });

  it("requires measured pixel zero at DIN and the final pixel at DOUT", () => {
    const wrongDin = structuredClone(loadProfile());
    wrongDin.dataConnectors.dinCorner = "top-right";
    expect(() => parsePanelHardwareProfile(wrongDin)).toThrow(
      "pixel zero must be at DIN",
    );

    const wrongDout = structuredClone(loadProfile());
    wrongDout.dataConnectors.doutCorner = "bottom-left";
    expect(() => parsePanelHardwareProfile(wrongDout)).toThrow(
      "final pixel must be at DOUT",
    );
  });

  it("preserves provisional correction evidence without changing the approved profile", () => {
    const profile = loadProfile();
    profile.mounting.physicalCorrections.status = "provisional" as "measured";

    expect(parsePanelHardwareProfile(profile).mounting.physicalCorrections.status)
      .toBe("provisional");
    expect(loadProfile().mounting.physicalCorrections).toMatchObject({
      holeEdge: 0.2,
      surfaceFlush: 0.5,
      status: "measured",
    });
  });

  it("requires explicit connector anchors for pose-local orientation", () => {
    const profile = loadProfile();
    profile.dataConnectors.orientationReference =
      "pose-local-explicit-connectors" as "three-mounting-holes-vertical";
    delete profile.dataConnectors.localPositions;

    expect(() => parsePanelHardwareProfile(profile)).toThrow(
      "requires explicit DIN and DOUT positions",
    );
  });

  it("rejects use of a connector-blocked mounting hole", () => {
    const profile = loadProfile();
    profile.mounting.holes.find(
      (hole) => hole.id === "bottom-right",
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
