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

    expect(parts).toHaveLength(normalized.panels.length + interMembers.length);
    expect(new Set(parts.map(({ partId }) => partId)).size).toBe(parts.length);
    expect(parts.filter(({ kind }) => kind === "panel-bracket")).toHaveLength(2);
    expect(parts.filter(({ kind }) => kind === "strut")).toHaveLength(interMembers.length);
    for (const part of parts) {
      expect(part.status).toBe("NoError");
      expect(part.volumeCubicMm).toBeGreaterThan(1);
      expect(part.numTri).toBeGreaterThan(12);
      expect(part.vertProperties.every((value) => Number.isFinite(value))).toBe(true);
      expect(part.triVerts.length % 3).toBe(0);
      expect(part.boundingBoxMm.max.every((value, index) =>
        value > part.boundingBoxMm.min[index]!
      )).toBe(true);
      if (part.kind === "strut") expect(part.genus).toBe(0);
    }
  });

  it("preserves exact anchors and cuts screw holes, nut traps, sockets, and cable clearance", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    const bracket = parts.find(({ partId }) => partId === "panel-bracket:P-01")!;
    const panelAnchors = normalized.anchors.filter(({ panelId }) => panelId === "P-01");

    expect(bracket.anchorIds).toEqual(panelAnchors.map(({ id }) => id));
    expect(bracket.anchorCentersMm).toEqual(panelAnchors.map(({ positionMm }) => ({
      x: positionMm[0], y: positionMm[1], z: positionMm[2],
    })));
    expect(bracket.printedPilotDiameterMm).toBe(1.6);
    expect(bracket.holeEdgeCorrectionMm).toBe(0.2);
    expect(bracket.surfaceFlushCorrectionMm).toBe(0.5);
    expect(bracket.screwHoleCentersMm.map(({ x }) => Math.abs(x))).toEqual([
      24.8, 24.8, 24.8, 24.8,
    ]);
    expect(bracket.screwHoleCentersMm).toHaveLength(4);
    expect(bracket.nutTrapCentersMm).toHaveLength(4);
    expect(bracket.cableClearanceCentersMm).toHaveLength(2);
    expect(bracket.socketCentersMm).toHaveLength(16);
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
    const { normalized, optimized } = await structuralFixture(1);

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /intersects PCB envelope/,
    );
  });
});
