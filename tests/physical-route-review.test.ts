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
  createPhysicalPanelReviewReference,
  createPhysicalRouteReviewSession,
  nextPhysicalRouteReviewSlot,
  physicalRouteReviewChanges,
  rotatePhysicalRouteReviewPanel,
  swapPhysicalRouteReviewRowsColumns,
} from "../web/src/PhysicalRouteReview.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";
import { logicalFramebufferForPhysicalFrame } from "../web/src/Esp32Setup.ts";
import { logicalPixelsToRgbFramebuffer } from "../web/src/ExternalFrameMirror.ts";

const SOURCE = "sculptures/rhombicosidodecahedron/sculpture.json";
const PROFILE = JSON.parse(
  readFileSync("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
);

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
    contract: createHardwareMappingContract(
      mapping,
      wiring,
      project.panelProfile,
    ),
  };
}

describe("physical route review", () => {
  it("rotates RGBW physical samples while the reference stays fixed and matches the saved mapping", () => {
    const { project, contract } = loaded();
    let session = createPhysicalRouteReviewSession(project.sculpture, contract);
    session = assignPhysicalRouteReviewPanel(
      session,
      0,
      session.slots[1]!.panelId,
    );
    const reference = createPhysicalPanelReviewReference(session, 0);
    const startFrame = createPhysicalPanelReviewFrame(session, 0);
    const patterns = new Set<string>();
    for (let turn = 0; turn < 4; turn += 1) {
      const frame = createPhysicalPanelReviewFrame(session, 0);
      patterns.add(JSON.stringify(frame));
      expect(createPhysicalPanelReviewReference(session, 0)).toEqual(reference);
      let confirmed = session;
      for (let slot = 0; slot < session.slots.length; slot += 1) {
        confirmed = confirmPhysicalRouteReviewSlot(confirmed, slot);
      }
      const definition = applyPhysicalRouteReview(project.sculpture, confirmed);
      const reviewed = createPanelAssemblyProject(
        definition,
        SOURCE,
        project.panelProfile,
      );
      const mapping = createPanelAssemblyMapping(reviewed);
      const wiring = createProvisionalWiringPreview(
        mapping,
        reviewed.sculpture,
        reviewed.panelProfile,
      );
      const saved = createHardwareMappingContract(
        mapping,
        wiring,
        reviewed.panelProfile,
      );
      for (const entry of saved.mapping.entries) {
        expect(frame[entry.physicalIndex]).toEqual([
          reference[entry.logicalIndex]! >>> 16,
          (reference[entry.logicalIndex]! >>> 8) & 0xff,
          reference[entry.logicalIndex]! & 0xff,
        ]);
      }
      session = rotatePhysicalRouteReviewPanel(session, 0, 1);
    }
    expect(patterns).toHaveLength(4);
    expect(createPhysicalPanelReviewFrame(session, 0)).toEqual(startFrame);
  });

  it("uses four solid RGBW quadrants at the fixed pose-local corners", () => {
    const { project, contract } = loaded();
    const session = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
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
    expect(
      frame.filter((pixel) => pixel.some((channel) => channel !== 0)),
    ).toHaveLength(64);
    expect(frame[703]).toEqual([0, 0, 0]);
    expect(frame[704]).toEqual([255, 0, 0]);
    expect(frame[711]).toEqual([0, 255, 0]);
    expect(frame[760]).toEqual([0, 0, 255]);
    expect(frame[767]).toEqual([255, 255, 255]);
    expect(frame[768]).toEqual([0, 0, 0]);

    const reference = createPhysicalPanelReviewReference(session, 11);
    const corners = [
      [0, 7, 0xff0000],
      [7, 7, 0x00ff00],
      [0, 0, 0x0000ff],
      [7, 0, 0xffffff],
    ] as const;
    for (const [x, y, color] of corners) {
      const entry = contract.mapping.entries.find(
        (candidate) =>
          candidate.panelId === session.slots[11]!.panelId &&
          candidate.panelPixelX === x &&
          candidate.panelPixelY === y,
      )!;
      expect(reference[entry.logicalIndex]).toBe(color);
      expect(frame[entry.physicalIndex]).toEqual([
        color >>> 16,
        (color >>> 8) & 0xff,
        color & 0xff,
      ]);
    }
  });

  it("distinguishes all eight square orientations, including a row/column swap", () => {
    const { project, contract } = loaded();
    const session = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
    const patterns = new Set<string>();
    for (let turns = 0; turns < 4; turns += 1) {
      let rotated = session;
      for (let turn = 0; turn < turns; turn += 1) {
        rotated = rotatePhysicalRouteReviewPanel(rotated, 0, 1);
      }
      patterns.add(JSON.stringify(createPhysicalPanelReviewFrame(rotated, 0)));
      patterns.add(
        JSON.stringify(
          createPhysicalPanelReviewFrame(
            swapPhysicalRouteReviewRowsColumns(rotated, 0),
            0,
          ),
        ),
      );
    }
    expect(patterns.size).toBe(8);
  });

  it("swaps traversal axes twice without changing the candidate transform", () => {
    const { project, contract } = loaded();
    const session = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
    expect(session.canSwapRowsColumns).toBe(true);
    const swapped = swapPhysicalRouteReviewRowsColumns(session, 0);
    expect(swapped.slots[0]).toMatchObject({
      quarterTurnsClockwise: 3,
      mirrored: true,
      confirmed: false,
    });
    const restored = swapPhysicalRouteReviewRowsColumns(swapped, 0);
    expect(restored.slots[0]).toMatchObject({
      quarterTurnsClockwise: session.slots[0]!.quarterTurnsClockwise,
      mirrored: session.slots[0]!.mirrored,
    });
    expect(createPhysicalPanelReviewFrame(restored, 0)).toEqual(
      createPhysicalPanelReviewFrame(session, 0),
    );
    const mirrorOnly = rotatePhysicalRouteReviewPanel(swapped, 0, 1);
    expect(mirrorOnly.slots[0]).toMatchObject({
      quarterTurnsClockwise: session.slots[0]!.quarterTurnsClockwise,
      mirrored: true,
    });
    expect(
      physicalRouteReviewChanges(mirrorOnly, project.sculpture).join(" "),
    ).toContain("mirrored");
  });

  it("matches logical playback, physical review and the exported map on all 41 panels", () => {
    const { project, contract } = loaded();
    expect(contract.fingerprint).toBe("524500f5");
    const session = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
    for (let slot = 0; slot < 41; slot += 1) {
      const physical = createPhysicalPanelReviewFrame(session, slot);
      const reference = logicalPixelsToRgbFramebuffer(
        createPhysicalPanelReviewReference(session, slot),
      );
      const diagnostic = logicalFramebufferForPhysicalFrame(
        physical,
        contract.ledmap.map,
      );
      expect(diagnostic).toEqual(reference);
      // Pinned WLED applies this same table in show() to standalone and mapped DDP.
      const output = physical.map(() => [0, 0, 0]);
      reference.forEach((rgb, logical) => {
        output[contract.ledmap.map[logical]!] = rgb;
      });
      expect(output).toEqual(physical);
      const panelPixels = output.slice(
        session.slots[slot]!.physicalStartIndex,
        session.slots[slot]!.physicalStartIndex + 64,
      );
      expect(panelPixels).toHaveLength(64);
      for (const color of [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 255],
      ]) {
        expect(
          panelPixels.filter((pixel) =>
            pixel.every((value, index) => value === color[index]),
          ),
        ).toHaveLength(16);
      }
    }
  });

  it("supports every saved mirror and quarter-turn state through row/column swap apply and reload", () => {
    const { project } = loaded();
    for (const mirrored of [false, true]) {
      for (const quarterTurnsClockwise of [0, 1, 2, 3] as const) {
        const source = structuredClone(project.sculpture);
        source.panels = source.panels.map((panel) => ({
          ...panel,
          installedAddressTransform: {
            status: "measured",
            referenceView: "back",
            quarterTurnsClockwise,
            mirrored,
            selectionMethod: "manual",
          },
        }));
        source.calibration = {
          ...source.calibration,
          installedPanelOrientation: "measured",
        };
        const savedProject = createPanelAssemblyProject(
          source,
          SOURCE,
          project.panelProfile,
        );
        const savedMapping = createPanelAssemblyMapping(savedProject);
        const savedWiring = createProvisionalWiringPreview(
          savedMapping,
          savedProject.sculpture,
          savedProject.panelProfile,
        );
        const savedContract = createHardwareMappingContract(
          savedMapping,
          savedWiring,
          savedProject.panelProfile,
        );
        const session = createPhysicalRouteReviewSession(
          savedProject.sculpture,
          savedContract,
        );
        expect(session.slots[0]).toMatchObject({
          quarterTurnsClockwise,
          mirrored,
        });
        const swapped = swapPhysicalRouteReviewRowsColumns(session, 0);
        const restored = swapPhysicalRouteReviewRowsColumns(swapped, 0);
        expect(restored.slots[0]).toMatchObject({
          quarterTurnsClockwise,
          mirrored,
        });
        expect(createPhysicalPanelReviewFrame(restored, 0)).toEqual(
          createPhysicalPanelReviewFrame(session, 0),
        );
        const physical = createPhysicalPanelReviewFrame(swapped, 0);
        const reference = createPhysicalPanelReviewReference(session, 0);
        let confirmed = swapped;
        for (let slot = 0; slot < confirmed.slots.length; slot += 1) {
          confirmed = confirmPhysicalRouteReviewSlot(confirmed, slot);
        }
        const reviewed = applyPhysicalRouteReview(
          savedProject.sculpture,
          confirmed,
        );
        const reloaded = createPanelAssemblyProject(
          reviewed,
          SOURCE,
          savedProject.panelProfile,
        );
        const reloadedMapping = createPanelAssemblyMapping(reloaded);
        const reloadedWiring = createProvisionalWiringPreview(
          reloadedMapping,
          reloaded.sculpture,
          reloaded.panelProfile,
        );
        const reloadedContract = createHardwareMappingContract(
          reloadedMapping,
          reloadedWiring,
          reloaded.panelProfile,
        );
        for (const entry of reloadedContract.mapping.entries.filter(
          (entry) => entry.panelId === session.slots[0]!.panelId,
        )) {
          expect(physical[entry.physicalIndex]).toEqual([
            reference[entry.logicalIndex]! >>> 16,
            (reference[entry.logicalIndex]! >>> 8) & 0xff,
            reference[entry.logicalIndex]! & 0xff,
          ]);
        }
      }
    }
  });

  it("swaps unique panel assignments and invalidates an earlier affected confirmation", () => {
    const { project, contract } = loaded();
    const initial = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
    const firstId = initial.slots[0]!.panelId;
    const secondId = initial.slots[1]!.panelId;
    let session = confirmPhysicalRouteReviewSlot(initial, 1);
    session = assignPhysicalRouteReviewPanel(session, 0, secondId);
    expect(session.slots[0]).toMatchObject({
      panelId: secondId,
      confirmed: true,
    });
    expect(session.slots[1]).toMatchObject({
      panelId: firstId,
      confirmed: false,
    });
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
    expect(
      reviewed.panels.every(
        (panel) =>
          panel.installedAddressTransform?.status === "measured" &&
          panel.installedAddressTransform.selectionMethod === "manual",
      ),
    ).toBe(true);
    expect(
      reviewed.panels.find(({ id }) => id === secondId)
        ?.installedAddressTransform,
    ).toMatchObject({ quarterTurnsClockwise: 1, mirrored: false });
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
    const session = createPhysicalRouteReviewSession(
      project.sculpture,
      contract,
    );
    expect(() => applyPhysicalRouteReview(project.sculpture, session)).toThrow(
      /Confirm every unique physical panel/,
    );
  });

  it("uses half turns for a non-square flexible fixture", () => {
    const source = "sculptures/one-metre-led-ring/sculpture.json";
    const ringProject = createPanelAssemblyProject(
      JSON.parse(readFileSync(source, "utf8")),
      source,
      JSON.parse(
        readFileSync(
          "sculptures/one-metre-led-ring/panel-profile.json",
          "utf8",
        ),
      ),
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
    expect(session.canSwapRowsColumns).toBe(false);
    expect(session.slots).toHaveLength(1);
    expect(session.slots[0]!.pixelCount).toBe(188);
    session = rotatePhysicalRouteReviewPanel(session, 0, 1);
    expect(session.slots[0]!.quarterTurnsClockwise).toBe(2);
    expect(
      createPhysicalPanelReviewFrame(session, 0).filter((pixel) =>
        pixel.some((channel) => channel !== 0),
      ),
    ).toHaveLength(188);
  });
});
