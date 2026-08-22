import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildStructuralSolids,
  structuralMeshContainsPoint,
  STRUCTURAL_GEOMETRY_POLICY,
} from "../src/cad/GenerateStructuralSolids.ts";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { normalizeStructuralDesign } from "../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss } from "../src/structure/CandidateTruss.ts";
import { optimizeStructuralTruss } from "../src/structure/TrussOptimizer.ts";

async function structuralFixture(bracketOffsetMm?: number) {
  const path = "sculptures/pose-only-two-panel/sculpture.json";
  const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
  const normalized = normalizeStructuralDesign(createPanelAssemblyProject(source, path));
  if (bracketOffsetMm !== undefined) {
    normalized.design.fabrication.bracketOffsetMm = bracketOffsetMm;
  }
  const optimized = optimizeStructuralTruss(normalized, createCandidateTruss(normalized));
  return { normalized, optimized };
}

describe("Manifold structural solids", () => {
  it("builds separated watertight panel brackets and tapered socket struts", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    const interMembers = optimized.optimizedCandidate.members.filter(
      ({ kind }) => kind === "inter-panel",
    );

    expect(parts).toHaveLength(
      optimized.optimizedCandidate.connectorCells.length * 2 + interMembers.length,
    );
    expect(new Set(parts.map(({ partId }) => partId)).size).toBe(parts.length);
    expect(parts.filter(({ kind }) => kind === "connector-bracket")).toHaveLength(2);
    expect(parts.filter(({ kind }) => kind === "strut-segment")).toHaveLength(interMembers.length);
    for (const part of parts) {
      expect(part.status).toBe("NoError");
      expect(part.volumeCubicMm).toBeGreaterThan(1);
      expect(part.numTri).toBeGreaterThan(12);
      expect(part.vertProperties.every((value) => Number.isFinite(value))).toBe(true);
      expect(part.triVerts.length % 3).toBe(0);
      expect(part.boundingBoxMm.max.every((value, index) =>
        value > part.boundingBoxMm.min[index]!
      )).toBe(true);
      if (part.kind === "strut-segment") expect(part.genus).toBe(0);
    }
  });

  it("preserves exact anchors and cuts screw holes, nut traps, sockets, and cable clearance", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    const cell = optimized.optimizedCandidate.connectorCells[0]!;
    const bracket = parts.find(({ partId }) =>
      partId === "connector-bracket:P-01--P-02:side:P-01"
    )!;
    const panelAnchors = normalized.anchors.filter(({ id }) =>
      cell.panelAnchorIds[0].includes(id)
    );

    expect(bracket.anchorIds).toEqual(panelAnchors.map(({ id }) => id));
    expect(bracket.anchorCentersMm).toEqual(panelAnchors.map(({ positionMm }) => ({
      x: positionMm[0], y: positionMm[1], z: positionMm[2],
    })));
    expect(bracket.printedPilotDiameterMm).toBe(1.6);
    expect(bracket.holeEdgeCorrectionMm).toBe(0.2);
    expect(bracket.surfaceFlushCorrectionMm).toBe(0.5);
    expect(bracket.screwHoleCentersMm.map(({ x }) => Math.abs(x))).toEqual([
      24.8, 24.8,
    ]);
    expect(bracket.screwHoleCentersMm).toHaveLength(2);
    expect(bracket.nutTrapCentersMm).toHaveLength(2);
    expect(bracket.cableClearanceCentersMm).toHaveLength(2);
    expect(bracket.socketCentersMm).toHaveLength(9);
    for (const point of [
      ...bracket.screwHoleCentersMm,
      ...bracket.nutTrapCentersMm,
      ...bracket.cableClearanceCentersMm,
      ...bracket.socketCentersMm,
    ]) {
      expect(await structuralMeshContainsPoint(bracket, point)).toBe(false);
    }
    expect(bracket.orientationMarkCenterMm).toBeDefined();
    expect(await structuralMeshContainsPoint(bracket, bracket.orientationMarkCenterMm!))
      .toBe(true);
    expect(STRUCTURAL_GEOMETRY_POLICY.minimumWallMm).toBeGreaterThanOrEqual(1.2);
    expect(STRUCTURAL_GEOMETRY_POLICY.nutTrapAcrossFlatsMm).toBe(4.2);
  });

  it("splits long connector struts into print-bed-bounded segments and sleeves", async () => {
    const { normalized, optimized } = await structuralFixture();
    normalized.connectorization.maximumStrutSegmentLengthMm = 30;
    const parts = await buildStructuralSolids(normalized, optimized);
    const segments = parts.filter(({ kind }) => kind === "strut-segment");
    const sleeves = parts.filter(({ kind }) => kind === "splice-sleeve");

    expect(segments.some(({ segmentCount }) => (segmentCount ?? 1) > 1)).toBe(true);
    expect(sleeves.length).toBeGreaterThan(0);
    expect(parts.every(({ boundingBoxMm }) => {
      const extents = boundingBoxMm.max.map(
        (value, axis) => value - boundingBoxMm.min[axis]!,
      ).sort((left, right) => left - right);
      return extents.every((extent) => extent <= 240 + 1e-5);
    })).toBe(true);
    expect(new Set(parts.map(({ partId }) => partId)).size).toBe(parts.length);
  });

  it("bounds the number of generated strut segments", async () => {
    const { normalized, optimized } = await structuralFixture();
    normalized.connectorization.maximumStrutSegmentLengthMm = 0.001;

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /safe limit is 256/,
    );
  });

  it("rejects geometry for an optimization that did not converge", async () => {
    const { normalized, optimized } = await structuralFixture();
    optimized.status = "infeasible";

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /requires converged optimization/,
    );
  });

  it("rejects a stale optimized candidate fingerprint", async () => {
    const { normalized, optimized } = await structuralFixture();
    optimized.optimizedCandidate.sourceFingerprint.value = "stale-candidate";

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /candidate fingerprint does not match/,
    );
  });

  it("rejects generated solid volumes that enter a PCB envelope", async () => {
    const { normalized, optimized } = await structuralFixture();
    normalized.panels[0]!.centerMm[1] -= 8;

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /intersects PCB envelope/,
    );
  });
});
