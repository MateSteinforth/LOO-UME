import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadCanonicalSculptureProject,
  parsePanelHardwareProfile,
  parseSculptureDefinition,
} from "../src/sculpture/Definition.ts";
import { createPanelizedSculptureMapping } from "../web/src/LedMapping.ts";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

describe("canonical sculpture source", () => {
  it("loads the versioned source and fixed panel profile", () => {
    const project = loadCanonicalSculptureProject();

    expect(project.sculpture.schemaVersion).toBe("1.0.0");
    expect(project.sculpture.panelProfile).toBe(project.panelProfile.id);
    expect(project.sculpture.wiring.controller).toEqual({
      placement: "near-top",
      status: "provisional",
    });
    expect(project.panelProfile.dimensions).toEqual({
      width: 66,
      height: 65,
      thickness: 0.8,
    });
    expect(project.panelProfile.pixelGrid.provisionalOrder).toMatchObject({
      status: "provisional",
      pixelZeroCorner: "bottom-left",
      traversalAxis: "rows",
      lineProgression: "bottom-to-top",
      serpentine: true,
      firstLineDirection: "left-to-right",
    });
    expect(project.panelProfile.dataConnectors).toMatchObject({
      referenceView: "back",
      orientationReference: "three-mounting-holes-vertical",
      cornerAssignmentStatus: "measured",
      dinCorner: "bottom-left",
      doutCorner: "top-right",
      padPositionStatus: "unknown",
    });
    expect(project.panelProfile.mounting.holes).toMatchObject([
      { id: "top-left", mechanicalUse: "eligible" },
      { id: "middle-left", mechanicalUse: "eligible" },
      { id: "bottom-left", mechanicalUse: "blocked", blockedBy: "DIN" },
      { id: "top-right", mechanicalUse: "blocked", blockedBy: "DOUT" },
      { id: "middle-right", mechanicalUse: "eligible" },
      { id: "bottom-right", mechanicalUse: "eligible" },
    ]);
    expect(project.panelProfile.mounting.capAllocation).toEqual({
      strategy: "minimum-total-edge-distance",
      useAllEligibleHolesWhenPossible: true,
      distinctClosurePerHole: true,
    });
    expect(project.panelProfile.power).toMatchObject({
      status: "provisional",
      nominalVoltage: 5,
      worstCaseCurrentPerPixel: 0.06,
      worstCaseCurrentPerPanel: 3.84,
      pads: {
        availableAt: ["din-end", "dout-end"],
        roles: ["V+", "V-"],
        supportsIndependentFeedAndInjection: true,
      },
      singlePanelLead: {
        minimumCrossSectionMm2: 0.75,
        approximateAwg: 18,
      },
      voltageDrop: {
        maximumFraction: 0.05,
        minimumPanelVoltage: 4.75,
      },
      fusing: {
        panelsPerFuse: null,
        sizingRule: "protect-wire",
      },
    });
    expect(project.panelProfile.mounting.physicalCorrections).toMatchObject({
      holeEdge: 0.2,
      surfaceFlush: 0.5,
      status: "measured",
    });
  });

  it("compiles the canonical source to the existing golden mapping", () => {
    const project = loadCanonicalSculptureProject();
    const geometry = createPanelizedSculptureMapping(
      project.sculpture,
      project.panelProfile,
    );
    const wiring = createProvisionalWiringPreview(
      geometry,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    );

    expect(geometry.panels).toHaveLength(41);
    expect(geometry.entries).toHaveLength(2624);
    expect(wiring.outputs.map((output) => output.panelIds.length)).toEqual([
      11, 10, 10, 10,
    ]);
    expect(contract.fingerprint).toBe("31291c59");
    expect(validateLedmapEquivalence(contract.mapping, contract.ledmap)).toEqual(
      [],
    );
  });

  it("uses source placement and wiring policy instead of hidden constants", () => {
    const project = loadCanonicalSculptureProject();
    const movedDefinition = structuredClone(project.sculpture);
    movedDefinition.centerPanelMount.offsetX += 1;
    const original = createPanelizedSculptureMapping(
      project.sculpture,
      project.panelProfile,
    );
    const moved = createPanelizedSculptureMapping(
      movedDefinition,
      project.panelProfile,
    );

    expect(moved.panels.find((panel) => panel.id === "SQ-01")?.position).toEqual(
      original.panels.find((panel) => panel.id === "SQ-01")?.position,
    );
    expect(moved.panels.find((panel) => panel.id === "PC-01")?.position).not.toEqual(
      original.panels.find((panel) => panel.id === "PC-01")?.position,
    );

    const reroutedDefinition = structuredClone(project.sculpture);
    reroutedDefinition.wiring.chainLengths = [10, 11, 10, 10];
    const rerouted = createProvisionalWiringPreview(
      original,
      reroutedDefinition,
      project.panelProfile,
    );
    expect(rerouted.outputs.map((output) => output.panelIds.length)).toEqual([
      10, 11, 10, 10,
    ]);
  });

  it("rejects invalid schema versions and unsafe loss of measured corrections", () => {
    const project = loadCanonicalSculptureProject();
    const invalidDefinition = structuredClone(project.sculpture) as unknown as
      Record<string, unknown>;
    invalidDefinition.schemaVersion = "2.0.0";
    expect(() => parseSculptureDefinition(invalidDefinition)).toThrow(
      "Unsupported sculpture schema version",
    );

    const invalidProfile = structuredClone(project.panelProfile);
    invalidProfile.mounting.physicalCorrections.status = "provisional" as "measured";
    expect(() => parsePanelHardwareProfile(invalidProfile)).toThrow(
      "must remain measured",
    );

    const blockedDin = structuredClone(project.panelProfile);
    blockedDin.mounting.holes.find(
      (hole) => hole.id === "bottom-left",
    )!.mechanicalUse = "eligible";
    expect(() => parsePanelHardwareProfile(blockedDin)).toThrow(
      "Eligible mounting holes cannot be marked",
    );

    const inconsistentPower = structuredClone(project.panelProfile);
    inconsistentPower.power.worstCaseCurrentPerPanel = 3.8;
    expect(() => parsePanelHardwareProfile(inconsistentPower)).toThrow(
      "must equal pixel count",
    );
  });

  it("ships parseable JSON Schemas for editors and external tooling", () => {
    const sculptureSchema = JSON.parse(
      readFileSync("schemas/sculpture.schema.json", "utf8"),
    ) as { $schema: string; $id: string };
    const panelSchema = JSON.parse(
      readFileSync("schemas/panel-profile.schema.json", "utf8"),
    ) as { $schema: string; $id: string };

    expect(sculptureSchema.$schema).toContain("2020-12");
    expect(sculptureSchema.$id).toContain("sculpture.schema.json");
    expect(panelSchema.$id).toContain("panel-profile.schema.json");
  });
});
