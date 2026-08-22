import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  normalizeStructuralDesign,
  type StructuralDesignDefinition,
} from "../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss } from "../src/structure/CandidateTruss.ts";
import {
  solveLinearTruss,
  solveStructuralTruss,
  TrussSolveError,
  type LinearTrussModel,
} from "../src/structure/TrussSolver.ts";

function barModel(): LinearTrussModel {
  return {
    nodes: [
      { id: "A", positionMm: [0, 0, 0] },
      { id: "B", positionMm: [100, 0, 0] },
    ],
    members: [{
      id: "AB",
      startNodeId: "A",
      endNodeId: "B",
      areaMm2: 10,
      youngsModulusMpa: 200_000,
      yieldStrengthMpa: 250,
      secondMomentAreaMm4: 10,
      safetyFactor: 2,
    }],
    supports: [
      { nodeId: "A", constrainedTranslations: ["x", "y", "z"] },
      { nodeId: "B", constrainedTranslations: ["y", "z"] },
    ],
    loadCases: [
      { id: "tension", nodalLoads: [{ nodeId: "B", forceNewtons: [1000, 0, 0] }] },
      { id: "compression", nodalLoads: [{ nodeId: "B", forceNewtons: [-1000, 0, 0] }] },
    ],
  };
}

async function definition(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-two-panel/sculpture.json",
    "utf8",
  )));
}

function authoredDesign(): StructuralDesignDefinition {
  return {
    schemaVersion: "1.0.0",
    material: {
      id: "test-petg",
      youngsModulusMpa: 2100,
      yieldStrengthMpa: 45,
      densityKgPerCubicMeter: 1270,
    },
    panelMassKg: 0.12,
    safetyFactor: 2,
    maximumDisplacementMm: 2,
    gravity: {
      installedDirection: [0, 0, -1],
      accelerationMetersPerSecondSquared: 9.81,
      includeWorldAxisTransportCases: true,
    },
    fabrication: {
      minimumMemberDiameterMm: 5,
      maximumMemberDiameterMm: 18,
      memberDiameterIncrementMm: 0.5,
      maximumUnsupportedCompressionLengthMm: 120,
      bracketOffsetMm: 9,
      cableClearanceMm: 14,
    },
    supports: [{
      id: "fixed-panel",
      kind: "panel",
      panelId: "P-01",
      constrainedTranslations: ["x", "y", "z"],
    }],
    loads: [
      {
        id: "face",
        kind: "panel-face-force",
        panelId: "P-02",
        forceNewtons: [0, 0, -10],
      },
      {
        id: "corner",
        kind: "panel-corner-force",
        panelId: "P-02",
        corner: "top-left",
        forceNewtons: [2, 0, 0],
      },
      {
        id: "cable",
        kind: "cable-pull",
        panelId: "P-02",
        connector: "DOUT",
        forceNewtons: [0, 3, 0],
      },
    ],
  };
}

describe("linear 3D truss solver", () => {
  it("matches the analytical axial bar result and equilibrium", () => {
    const result = solveLinearTruss(barModel());
    const tension = result.loadCases.find(({ id }) => id === "tension")!;
    const compression = result.loadCases.find(({ id }) => id === "compression")!;

    expect(tension.nodes.find(({ nodeId }) => nodeId === "B")!.displacementMm[0])
      .toBeCloseTo(0.05, 12);
    expect(tension.members[0]!.forceType).toBe("tension");
    expect(tension.members[0]!.axialForceNewtons).toBeCloseTo(1000, 9);
    expect(tension.members[0]!.stressMpa).toBeCloseTo(100, 9);
    expect(tension.members[0]!.utilization).toBeCloseTo(0.8, 9);
    expect(tension.members[0]!.bucklingUtilization).toBe(0);
    expect(tension.nodes.find(({ nodeId }) => nodeId === "A")!.reactionNewtons[0])
      .toBeCloseTo(-1000, 9);
    expect(Math.hypot(...tension.equilibriumResidualNewtons)).toBeLessThan(1e-9);
    expect(compression.members[0]!.forceType).toBe("compression");
    expect(compression.members[0]!.eulerBucklingCapacityNewtons)
      .toBeCloseTo(Math.PI ** 2 * 200, 9);
    expect(compression.members[0]!.bucklingUtilization).toBeGreaterThan(1);
  });

  it("is independent of node, member, support, axis, and load-case storage order", () => {
    const first = barModel();
    const reordered = structuredClone(first);
    reordered.nodes.reverse();
    reordered.members.reverse();
    reordered.supports.reverse();
    for (const support of reordered.supports) support.constrainedTranslations.reverse();
    reordered.loadCases.reverse();

    expect(solveLinearTruss(reordered)).toEqual(solveLinearTruss(first));
  });

  it("rejects no supports, rigid-body mechanisms, and zero-length members", () => {
    const unsupported = barModel();
    unsupported.supports = [];
    expect(() => solveLinearTruss(unsupported)).toThrowError(
      expect.objectContaining<Partial<TrussSolveError>>({ code: "SINGULAR_SYSTEM" }),
    );
    expect(() => solveLinearTruss(unsupported)).toThrow(/no constrained translations/);

    const mechanism = barModel();
    mechanism.supports = [{ nodeId: "A", constrainedTranslations: ["x", "y", "z"] }];
    expect(() => solveLinearTruss(mechanism)).toThrow(/rigid-body mechanism/);

    const zeroLength = barModel();
    zeroLength.nodes[1]!.positionMm = [0, 0, 0];
    expect(() => solveLinearTruss(zeroLength)).toThrow(/Member AB has zero length/);

    const overflow = barModel();
    overflow.members[0]!.areaMm2 = Number.MAX_VALUE;
    overflow.members[0]!.youngsModulusMpa = Number.MAX_VALUE;
    expect(() => solveLinearTruss(overflow)).toThrowError(
      expect.objectContaining<Partial<TrussSolveError>>({ code: "NUMERICAL_FAILURE" }),
    );
  });

  it("keeps the residual check relative for sub-newton loads", () => {
    const tinyLoad = barModel();
    tinyLoad.loadCases = [{
      id: "tiny",
      nodalLoads: [{ nodeId: "B", forceNewtons: [1e-12, 0, 0] }],
    }];
    const result = solveLinearTruss(tinyLoad).loadCases[0]!;

    expect(result.members[0]!.axialForceNewtons).toBeCloseTo(1e-12, 20);
    expect(Math.hypot(...result.equilibriumResidualNewtons)).toBeLessThan(1e-24);
  });

  it("solves all normalized gravity and point-load kinds and selects governing cases", async () => {
    const source = await definition();
    source.structuralDesign = authoredDesign();
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(
      source,
      "tests/structural-load-cases/sculpture.json",
    ));
    const analysis = solveStructuralTruss(normalized, createCandidateTruss(normalized));

    expect(analysis.loadCases.map(({ id }) => id)).toEqual([
      "force:cable",
      "force:corner",
      "force:face",
      "installed-gravity",
      "transport-negative-x",
      "transport-negative-y",
      "transport-negative-z",
      "transport-positive-x",
      "transport-positive-y",
      "transport-positive-z",
    ]);
    const face = analysis.loadCases.find(({ id }) => id === "force:face")!;
    expect(face.nodes.filter(({ appliedForceNewtons }) => appliedForceNewtons[2] !== 0))
      .toHaveLength(4);
    const corner = analysis.loadCases.find(({ id }) => id === "force:corner")!;
    expect(corner.nodes.filter(({ appliedForceNewtons }) => appliedForceNewtons[0] !== 0))
      .toHaveLength(1);
    const cable = analysis.loadCases.find(({ id }) => id === "force:cable")!;
    expect(cable.nodes.filter(({ appliedForceNewtons }) => appliedForceNewtons[1] !== 0))
      .toHaveLength(1);
    expect(analysis.loadCases.every(({ equilibriumResidualNewtons }) =>
      Math.hypot(...equilibriumResidualNewtons) < 1e-8
    )).toBe(true);
    expect(analysis.governingMembers).toHaveLength(analysis.loadCases[0]!.members.length);
    expect(analysis.governingMembers.every(({ governingLoadCaseId }) =>
      analysis.loadCases.some(({ id }) => id === governingLoadCaseId)
    )).toBe(true);
    expect(analysis.disclaimer).toMatch(/not engineering certification/);
  });
});
