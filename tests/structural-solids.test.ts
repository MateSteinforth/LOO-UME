import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildStructuralRibbonSolids,
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
  it("builds one watertight cap-surface loft per local connector cell", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    expect(parts).toHaveLength(optimized.optimizedCandidate.connectorCells.length);
    expect(new Set(parts.map(({ partId }) => partId)).size).toBe(parts.length);
    expect(parts.every(({ kind }) => kind === "organic-connector")).toBe(true);
    for (const part of parts) {
      expect(part.status).toBe("NoError");
      expect(part.volumeCubicMm).toBeGreaterThan(1);
      expect(part.numTri).toBeGreaterThan(12);
      expect(part.vertProperties.every((value) => Number.isFinite(value))).toBe(true);
      expect(part.triVerts.length % 3).toBe(0);
      expect(part.boundingBoxMm.max.every((value, index) =>
        value > part.boundingBoxMm.min[index]!
      )).toBe(true);
      expect(part.genus).toBe(part.anchorIds.length);
    }
  });

  it("unites co-located paths into one watertight three-panel ribbon junction", async () => {
    const path = "sculptures/structural-three-panel-junction/sculpture.json";
    const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(source, path));
    const candidate = createCandidateTruss(normalized);
    const parts = await buildStructuralRibbonSolids(normalized, candidate);

    expect(candidate.connectorCells).toHaveLength(2);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      partId: "ribbon-junction:P-01--P-02--P-03",
      kind: "ribbon-junction",
      connectorJunctionId: "junction:P-01--P-02--P-03",
      panelIds: ["P-01", "P-02", "P-03"],
      status: "NoError",
    });
    expect(parts[0]!.anchorIds).toHaveLength(6);
    expect(parts[0]!.genus).toBe(parts[0]!.anchorIds.length);
    for (const point of [
      ...parts[0]!.screwHoleCentersMm,
      ...parts[0]!.nutTrapCentersMm,
      ...parts[0]!.cableClearanceCentersMm,
    ]) {
      expect(await structuralMeshContainsPoint(parts[0]!, point)).toBe(false);
    }
  });

  it("preserves exact anchors and cuts screw holes, nut traps, sockets, and cable clearance", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    const cell = optimized.optimizedCandidate.connectorCells[0]!;
    const bracket = parts.find(({ partId }) =>
      partId === "organic-connector:P-01--P-02"
    )!;
    const panelAnchors = normalized.anchors.filter(({ id }) =>
      cell.panelAnchorIds.flat().includes(id)
    );

    expect(bracket.anchorIds).toEqual(panelAnchors.map(({ id }) => id));
    expect(bracket.anchorCentersMm).toEqual(panelAnchors.map(({ positionMm }) => ({
      x: positionMm[0], y: positionMm[1], z: positionMm[2],
    })));
    expect(bracket.printedPilotDiameterMm).toBe(1.6);
    expect(bracket.holeEdgeCorrectionMm).toBe(0.2);
    expect(bracket.surfaceFlushCorrectionMm).toBe(0.5);
    expect(bracket.screwHoleCentersMm).toHaveLength(4);
    expect(bracket.nutTrapCentersMm).toHaveLength(4);
    expect(bracket.nutTrapDepthMm).toBe(2.2);
    expect(bracket.cableClearanceCentersMm).toHaveLength(4);
    expect(bracket.socketCentersMm).toHaveLength(0);
    for (const point of [
      ...bracket.screwHoleCentersMm,
      ...bracket.nutTrapCentersMm,
      ...bracket.cableClearanceCentersMm,
      ...bracket.socketCentersMm,
    ]) {
      expect(await structuralMeshContainsPoint(bracket, point)).toBe(false);
    }
    for (let index = 0; index < panelAnchors.length; index += 1) {
      const anchor = panelAnchors[index]!;
      const panel = normalized.panels.find(({ id }) => id === anchor.panelId)!;
      const acrossPocket = Math.abs(anchor.localPositionMm[0]) >=
          Math.abs(anchor.localPositionMm[1]) ? panel.yAxis : panel.xAxis;
      const center = bracket.nutTrapCentersMm[index]!;
      const beyondPocket = {
        x: center.x - panel.outwardNormal[0] * 3 + acrossPocket[0] * 2,
        y: center.y - panel.outwardNormal[1] * 3 + acrossPocket[1] * 2,
        z: center.z - panel.outwardNormal[2] * 3 + acrossPocket[2] * 2,
      };
      expect(await structuralMeshContainsPoint(bracket, beyondPocket)).toBe(true);
    }
    expect(bracket.orientationMarkCenterMm).toBeDefined();
    expect(await structuralMeshContainsPoint(bracket, bracket.orientationMarkCenterMm!))
      .toBe(true);
    expect(STRUCTURAL_GEOMETRY_POLICY.minimumWallMm).toBeGreaterThanOrEqual(1.2);
    expect(STRUCTURAL_GEOMETRY_POLICY.nutTrapAcrossFlatsMm).toBe(4.2);
  });

  it("extends each cap shoe through a continuous print-bed-bounded loft", async () => {
    const { normalized, optimized } = await structuralFixture();
    const parts = await buildStructuralSolids(normalized, optimized);
    const body = parts[0]!;
    expect(body.loftStationCentersMm).toHaveLength(
      STRUCTURAL_GEOMETRY_POLICY.loftStationCount,
    );
    expect(STRUCTURAL_GEOMETRY_POLICY.loftRearDepartureMm).toBe(6);
    for (const center of body.loftStationCentersMm!) {
      expect(await structuralMeshContainsPoint(body, center)).toBe(true);
    }
    expect(parts.every(({ boundingBoxMm }) => {
      const extents = boundingBoxMm.max.map(
        (value, axis) => value - boundingBoxMm.min[axis]!,
      ).sort((left, right) => left - right);
      return extents.every((extent) => extent <= 240 + 1e-5);
    })).toBe(true);
    expect(new Set(parts.map(({ partId }) => partId)).size).toBe(parts.length);
  });

  it("rejects a long loft that exceeds the configured print envelope", async () => {
    const { normalized, optimized } = await structuralFixture();
    for (const node of optimized.optimizedCandidate.nodes) {
      if (node.panelId === "P-02") node.positionMm[0] += 4_000;
    }
    for (const anchor of optimized.optimizedCandidate.anchors) {
      if (anchor.panelId === "P-02") anchor.positionMm[0] += 4_000;
    }
    for (const bracket of optimized.optimizedCandidate.brackets) {
      if (bracket.panelId !== "P-02") continue;
      bracket.anchorPositionMm[0] += 4_000;
      bracket.hubPositionMm[0] += 4_000;
    }
    const nodeById = new Map(optimized.optimizedCandidate.nodes.map((node) => [node.id, node]));
    for (const member of optimized.optimizedCandidate.members) {
      const start = nodeById.get(member.startNodeId)!.positionMm;
      const end = nodeById.get(member.endNodeId)!.positionMm;
      member.lengthMm = Math.hypot(
        start[0] - end[0], start[1] - end[1], start[2] - end[2],
      );
    }

    await expect(buildStructuralSolids(normalized, optimized)).rejects.toThrow(
      /does not fit the configured print bed after margins/,
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
