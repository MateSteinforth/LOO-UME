import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  applyPhysicalRouteReview,
  assignPhysicalRouteReviewPanel,
  confirmPhysicalRouteReviewSlot,
  createPhysicalPanelReviewFrame,
  createPhysicalRouteReviewSession,
  nextPhysicalRouteReviewSlot,
  physicalRouteReviewChanges,
  rotatePhysicalRouteReviewPanel,
} from "../web/src/PhysicalRouteReview.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const SOURCE = "sculptures/rhombicosidodecahedron/sculpture.json";
const PROFILE = JSON.parse(readFileSync(
  "catalog/panels/ws2812b-8x8-66x65.json",
  "utf8",
));

function loaded() {
  const project = createPanelAssemblyProject(
    JSON.parse(readFileSync(SOURCE, "utf8")),
    SOURCE,
    PROFILE,
  );
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  return {
    project,
    contract: createHardwareMappingContract(mapping, wiring, project.panelProfile),
  };
}

describe("physical route review", () => {
  it("creates one low-scope physical panel frame with a DIN-to-DOUT gradient", () => {
    const { project, contract } = loaded();
    const session = createPhysicalRouteReviewSession(project.sculpture, contract);
    expect(session.slots).toHaveLength(41);
    expect(session.slots[0]).toMatchObject({
      outputIndex: 0,
      chainPosition: 0,
      physicalStartIndex: 0,
      pixelCount: 64,
      confirmed: false,
    });
    expect(session.slots[11]).toMatchObject({
      outputIndex: 1,
      chainPosition: 0,
      physicalStartIndex: 704,
    });

    const frame = createPhysicalPanelReviewFrame(session, 11);
    expect(frame).toHaveLength(2_624);
    expect(frame.filter((pixel) => pixel.some((channel) => channel !== 0)))
      .toHaveLength(64);
    expect(frame[703]).toEqual([0, 0, 0]);
    expect(frame[704]).toEqual([0, 255, 0]);
    expect(frame[767]).toEqual([128, 0, 160]);
    expect(frame[768]).toEqual([0, 0, 0]);
  });

  it("swaps unique panel assignments and invalidates an earlier affected confirmation", () => {
    const { project, contract } = loaded();
    const initial = createPhysicalRouteReviewSession(project.sculpture, contract);
    const firstId = initial.slots[0]!.panelId;
    const secondId = initial.slots[1]!.panelId;
    let session = confirmPhysicalRouteReviewSlot(initial, 1);
    session = assignPhysicalRouteReviewPanel(session, 0, secondId);
    expect(session.slots[0]).toMatchObject({ panelId: secondId, confirmed: true });
    expect(session.slots[1]).toMatchObject({ panelId: firstId, confirmed: false });
    expect(new Set(session.slots.map((slot) => slot.panelId)).size).toBe(41);
    expect(nextPhysicalRouteReviewSlot(session, 0)).toBe(1);
    expect(initial.slots[0]!.panelId).toBe(firstId);
  });

  it("applies only the reviewed route and installed address calibration", () => {
    const { project, contract } = loaded();
    const source = project.sculpture;
    const protectedState = {
      panelPoses: source.panels.map(({ id, pose }) => ({ id, pose })),
      mechanicalShell: source.mechanicalShell,
      boundaryTopology: source.boundaryTopology,
      generatedMechanics: source.generatedMechanics,
      structuralDesign: source.structuralDesign,
      generatedStructure: source.generatedStructure,
      controller: source.wiring.controller,
      connector: source.wiring.connector,
      gpios: source.wiring.outputs.map(({ gpio }) => gpio),
      panelProfile: source.panelProfile,
    };
    let session = createPhysicalRouteReviewSession(source, contract);
    const firstId = session.slots[0]!.panelId;
    const secondId = session.slots[1]!.panelId;
    session = assignPhysicalRouteReviewPanel(session, 0, secondId);
    session = rotatePhysicalRouteReviewPanel(session, 0, 1);
    for (let index = 0; index < session.slots.length; index += 1) {
      session = confirmPhysicalRouteReviewSlot(session, index);
    }
    const changes = physicalRouteReviewChanges(session, source);
    expect(changes.join(" ")).toContain(`${firstId} becomes ${secondId}`);
    expect(changes.join(" ")).toContain("90° clockwise");

    const reviewed = applyPhysicalRouteReview(source, session);
    expect(reviewed.wiring.outputs[0]!.panelIds!.slice(0, 2)).toEqual([
      secondId,
      firstId,
    ]);
    expect(reviewed.wiring).toMatchObject({
      status: "authored",
      routeStrategy: "manual-authored-route",
      routeRevision: (source.wiring.routeRevision ?? 0) + 1,
    });
    expect(reviewed.calibration).toMatchObject({
      installedPanelOrientation: "measured",
      physicalChains: "measured",
    });
    expect(reviewed.panels.every((panel) =>
      panel.installedAddressTransform?.status === "measured" &&
      panel.installedAddressTransform.selectionMethod === "manual"
    )).toBe(true);
    expect(reviewed.panels.find(({ id }) => id === secondId)?.installedAddressTransform)
      .toMatchObject({ quarterTurnsClockwise: 1, mirrored: false });
    expect({
      panelPoses: reviewed.panels.map(({ id, pose }) => ({ id, pose })),
      mechanicalShell: reviewed.mechanicalShell,
      boundaryTopology: reviewed.boundaryTopology,
      generatedMechanics: reviewed.generatedMechanics,
      structuralDesign: reviewed.structuralDesign,
      generatedStructure: reviewed.generatedStructure,
      controller: reviewed.wiring.controller,
      connector: reviewed.wiring.connector,
      gpios: reviewed.wiring.outputs.map(({ gpio }) => gpio),
      panelProfile: reviewed.panelProfile,
    }).toEqual(protectedState);

    const reviewedProject = createPanelAssemblyProject(
      reviewed,
      SOURCE,
      project.panelProfile,
    );
    const reviewedMapping = createPanelAssemblyMapping(reviewedProject);
    const reviewedWiring = createProvisionalWiringPreview(
      reviewedMapping,
      reviewed,
      project.panelProfile,
    );
    const reviewedContract = createHardwareMappingContract(
      reviewedMapping,
      reviewedWiring,
      project.panelProfile,
    );
    expect(reviewedContract.fingerprint).not.toBe(contract.fingerprint);
    expect(reviewedContract.readiness.mappingReady).toBe(true);
    expect(reviewedContract.readiness.blockers).not.toContain(
      "Installed panel orientations are neither route-optimized nor manually measured.",
    );
  });

  it("fails closed until every slot has been confirmed", () => {
    const { project, contract } = loaded();
    const session = createPhysicalRouteReviewSession(project.sculpture, contract);
    expect(() => applyPhysicalRouteReview(project.sculpture, session)).toThrow(
      /Confirm every unique physical panel/,
    );
  });

  it("uses half turns for a non-square flexible fixture", () => {
    const source = "sculptures/one-metre-led-ring/sculpture.json";
    const ringProject = createPanelAssemblyProject(
      JSON.parse(readFileSync(source, "utf8")),
      source,
      JSON.parse(readFileSync(
        "sculptures/one-metre-led-ring/panel-profile.json",
        "utf8",
      )),
    );
    const ringMapping = createPanelAssemblyMapping(ringProject);
    const ringWiring = createProvisionalWiringPreview(
      ringMapping,
      ringProject.sculpture,
      ringProject.panelProfile,
    );
    const ringContract = createHardwareMappingContract(
      ringMapping,
      ringWiring,
      ringProject.panelProfile,
    );
    let session = createPhysicalRouteReviewSession(
      ringProject.sculpture,
      ringContract,
    );
    expect(session.rotationStepQuarterTurns).toBe(2);
    expect(session.slots).toHaveLength(1);
    expect(session.slots[0]!.pixelCount).toBe(188);
    session = rotatePhysicalRouteReviewPanel(session, 0, 1);
    expect(session.slots[0]!.quarterTurnsClockwise).toBe(2);
    expect(createPhysicalPanelReviewFrame(session, 0).filter((pixel) =>
      pixel.some((channel) => channel !== 0)
    )).toHaveLength(188);
  });
});
