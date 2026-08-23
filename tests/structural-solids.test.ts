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
    expect(parts[0]!.nutTrapCentersMm).toEqual([]);
    expect(parts[0]!.cableClearanceCentersMm).toEqual([]);
    expect(parts[0]!.labelCentersMm?.map(({ panelId }) => panelId).sort()).toEqual([
      "P-01",
      "P-02",
      "P-03",
    ]);
    for (const point of parts[0]!.screwHoleCentersMm) {
      expect(await structuralMeshContainsPoint(parts[0]!, point)).toBe(false);
    }
    for (const point of parts[0]!.labelCentersMm ?? []) {
      expect(await structuralMeshContainsPoint(parts[0]!, point, 0.1)).toBe(false);
    }
  });

  it("removes Boolean sliver faces from the complex arbitrary-pose connector set", async () => {
    const path = "sculptures/rhombicosidodecahedron/sculpture.json";
    const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(source, path));
    const candidate = createCandidateTruss(normalized);
    const parts = await buildStructuralRibbonSolids(normalized, candidate);

    expect(candidate.connectorCells).toHaveLength(40);
    expect(parts).toHaveLength(37);
    expect(STRUCTURAL_GEOMETRY_POLICY.meshSimplificationToleranceMm).toBe(0.001);
    expect(parts.every(({ status }) => status === "NoError")).toBe(true);
    let minimumDoubledArea = Number.POSITIVE_INFINITY;
    for (const part of parts) {
      for (let index = 0; index < part.triVerts.length; index += 3) {
        const indices = [
          part.triVerts[index]! * 3,
          part.triVerts[index + 1]! * 3,
          part.triVerts[index + 2]! * 3,
        ];
        const points = indices.map((vertex) => [
          part.vertProperties[vertex]!,
          part.vertProperties[vertex + 1]!,
          part.vertProperties[vertex + 2]!,
        ]);
        const ab = points[1]!.map((value, axis) => value - points[0]![axis]!);
        const ac = points[2]!.map((value, axis) => value - points[0]![axis]!);
        minimumDoubledArea = Math.min(minimumDoubledArea, Math.hypot(
          ab[1]! * ac[2]! - ab[2]! * ac[1]!,
          ab[2]! * ac[0]! - ab[0]! * ac[2]!,
          ab[0]! * ac[1]! - ab[1]! * ac[0]!,
        ));
      }
    }
    expect(minimumDoubledArea).toBeGreaterThan(1e-10);
  }, 30_000);

  it("builds eleven independent print-bed-bounded ribbons for the rising spiral", async () => {
    const path = "sculptures/structural-twelve-panel-spiral/sculpture.json";
    const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(source, path));
    const candidate = createCandidateTruss(normalized);
    const parts = await buildStructuralRibbonSolids(normalized, candidate);

    expect(parts).toHaveLength(11);
    expect(parts.every(({ kind }) => kind === "organic-connector")).toBe(true);
    expect(parts.every(({ panelIds }) => panelIds?.length === 2)).toBe(true);
    expect(parts.every(({ boundingBoxMm }) => {
      const extents = boundingBoxMm.max.map(
        (value, axis) => value - boundingBoxMm.min[axis]!,
      ).sort((left, right) => left - right);
      return extents.every((extent) => extent <= 240 + 1e-5);
    })).toBe(true);
  }, 30_000);

  it("preserves exact anchors and cuts only screw-axis pilots and lead-ins", async () => {
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
    expect(bracket.nutTrapCentersMm).toEqual([]);
    expect(bracket.nutTrapDepthMm).toBeUndefined();
    expect(bracket.cableClearanceCentersMm).toEqual([]);
    expect(bracket.socketCentersMm).toHaveLength(0);
    expect(bracket.genus).toBe(bracket.screwHoleCentersMm.length);
    expect(bracket.labelDepthMm).toBe(0.55);
    expect(bracket.labelCentersMm?.map(({ panelId }) => panelId)).toEqual([
      "P-01",
      "P-02",
    ]);
    for (const point of bracket.screwHoleCentersMm) {
      expect(await structuralMeshContainsPoint(bracket, point)).toBe(false);
    }
    for (const point of bracket.labelCentersMm ?? []) {
      expect(await structuralMeshContainsPoint(bracket, point, 0.1)).toBe(false);
      const panel = normalized.panels.find(({ id }) => id === point.panelId)!;
      const belowEngraving = {
        x: point.x - panel.outwardNormal[0] * 0.7,
        y: point.y - panel.outwardNormal[1] * 0.7,
        z: point.z - panel.outwardNormal[2] * 0.7,
      };
      expect(await structuralMeshContainsPoint(bracket, belowEngraving, 0.1)).toBe(true);
    }
    expect(bracket.orientationMarkCenterMm).toBeDefined();
    expect(await structuralMeshContainsPoint(bracket, bracket.orientationMarkCenterMm!))
      .toBe(true);
    expect(STRUCTURAL_GEOMETRY_POLICY.minimumWallMm).toBeGreaterThanOrEqual(1.2);
    expect(STRUCTURAL_GEOMETRY_POLICY.panelLabelPixelMm).toBe(0.62);
    expect(STRUCTURAL_GEOMETRY_POLICY.panelLabelDepthMm).toBe(0.55);
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
