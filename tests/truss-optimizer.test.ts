import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  normalizeStructuralDesign,
  type NormalizedStructuralDesign,
} from "../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss, validateCandidateTruss } from "../src/structure/CandidateTruss.ts";
import { optimizeStructuralTruss } from "../src/structure/TrussOptimizer.ts";

async function normalizedProject(path: string): Promise<NormalizedStructuralDesign> {
  const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
  return normalizeStructuralDesign(createPanelAssemblyProject(source, path));
}

async function loadedTwoPanel(forceNewtons = -500): Promise<NormalizedStructuralDesign> {
  const normalized = await normalizedProject("sculptures/pose-only-two-panel/sculpture.json");
  normalized.loadCases = [{
    id: "compression-force",
    kind: "panel-face-force",
    panelId: "P-02",
    applicationPointMm: [50, 0, 0],
    forceNewtons: [forceNewtons, 0, 0],
    sourceLoadId: "compression-force",
  }];
  normalized.design.maximumDisplacementMm = 0.2;
  return normalized;
}

describe("structural truss optimization", () => {
  it("removes consistently low-load candidates and preserves redundant connectivity", async () => {
    const normalized = await normalizedProject(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    const candidate = createCandidateTruss(normalized);
    const optimized = optimizeStructuralTruss(normalized, candidate);

    expect(optimized.status).toBe("converged");
    expect(optimized.optimizedCandidate.members.length).toBeLessThan(candidate.members.length);
    expect(optimized.trace.some(({ action }) => action === "remove")).toBe(true);
    expect(optimized.trace.at(-1)?.action).toBe("converged");
    expect(optimized.trace.length).toBeLessThanOrEqual(optimized.policy.maximumIterations);
    expect(() => validateCandidateTruss(optimized.optimizedCandidate)).not.toThrow();
    expect(optimized.violations).toEqual([]);
  }, 15_000);

  it("rounds resized members up to printable increments and updates self-weight", async () => {
    const normalized = await loadedTwoPanel();
    normalized.design.fabrication.maximumMemberDiameterMm = 14.1;
    const candidate = createCandidateTruss(normalized);
    const initialMass = candidate.members.reduce((sum, member) =>
      sum + Math.PI * member.initialDiameterMm ** 2 / 4 * member.lengthMm * 1e-9 *
        normalized.design.material.densityKgPerCubicMeter,
    0);
    const optimized = optimizeStructuralTruss(normalized, candidate);

    expect(optimized.status).toBe("converged");
    expect(optimized.trace.some(({ action }) => action === "resize")).toBe(true);
    expect(optimized.members.every(({ diameterMm }) =>
      diameterMm >= normalized.design.fabrication.minimumMemberDiameterMm &&
      diameterMm <= normalized.design.fabrication.maximumMemberDiameterMm &&
      Number.isInteger(
        (diameterMm - normalized.design.fabrication.minimumMemberDiameterMm) /
        normalized.design.fabrication.memberDiameterIncrementMm,
      )
    )).toBe(true);
    expect(optimized.materialMassKg).toBeGreaterThan(initialMass);
    expect(optimized.policy.maximumPrintableDiameterMm).toBe(14);
    expect(optimized.objectiveBreakdown.unprintablePenalty).toBe(0);
    expect(optimized.objectiveBreakdown.fragileAttachmentPenalty).toBe(0);
    expect(optimized.analysis.loadCases[0]!.maximumDisplacementMm)
      .toBeLessThanOrEqual(normalized.design.maximumDisplacementMm);
  });

  it("reports explicit infeasible and iteration-limit outcomes", async () => {
    const infeasibleInput = await loadedTwoPanel(-10_000);
    infeasibleInput.design.maximumDisplacementMm = 0.01;
    infeasibleInput.design.fabrication.maximumMemberDiameterMm =
      infeasibleInput.design.fabrication.minimumMemberDiameterMm;
    const infeasible = optimizeStructuralTruss(
      infeasibleInput,
      createCandidateTruss(infeasibleInput),
    );
    expect(infeasible.status).toBe("infeasible");
    expect(infeasible.trace.at(-1)?.action).toBe("infeasible");
    expect(infeasible.violations).toEqual(expect.arrayContaining([
      expect.stringMatching(/Stress utilization/),
      expect.stringMatching(/Buckling utilization/),
      expect.stringMatching(/Displacement utilization/),
    ]));

    const boundedInput = await loadedTwoPanel();
    const bounded = optimizeStructuralTruss(
      boundedInput,
      createCandidateTruss(boundedInput),
      { maximumIterations: 1 },
    );
    expect(bounded.status).toBe("iteration-limit");
    expect(bounded.trace).toHaveLength(1);
    expect(bounded.trace.at(-1)?.action).toBe("resize");

    const limitedInfeasibleInput = await loadedTwoPanel(-10_000);
    limitedInfeasibleInput.design.maximumDisplacementMm = 0.01;
    const limitedInfeasible = optimizeStructuralTruss(
      limitedInfeasibleInput,
      createCandidateTruss(limitedInfeasibleInput),
      { maximumIterations: 1 },
    );
    expect(limitedInfeasible.status).toBe("iteration-limit");
    expect(limitedInfeasible.violations.length).toBeGreaterThan(0);
    expect(limitedInfeasible.trace.at(-1)?.action).toBe("resize");
  });

  it("rejects an unloaded-force ratio above one", async () => {
    const normalized = await loadedTwoPanel();
    const candidate = createCandidateTruss(normalized);

    expect(() => optimizeStructuralTruss(normalized, candidate, {
      unloadedForceRatio: 1.01,
    })).toThrow(/must not be greater than 1/);
  });

  it("is deterministic when candidate arrays are reordered", async () => {
    const normalized = await loadedTwoPanel();
    const candidate = createCandidateTruss(normalized);
    const reordered = structuredClone(candidate);
    reordered.anchors.reverse();
    reordered.brackets.reverse();
    reordered.nodes.reverse();
    reordered.members.reverse();
    reordered.panelAttachments.reverse();
    for (const attachment of reordered.panelAttachments) {
      attachment.anchorIds.reverse();
      attachment.bracketIds.reverse();
      attachment.hubNodeIds.reverse();
      attachment.localTieMemberIds.reverse();
    }

    expect(optimizeStructuralTruss(normalized, reordered))
      .toEqual(optimizeStructuralTruss(normalized, candidate));
  });
});
