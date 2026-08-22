import type { NormalizedStructuralDesign } from "../sculpture/StructuralDesign.ts";
import {
  validateCandidateTruss,
  type CandidateTruss,
  type CandidateTrussMember,
} from "./CandidateTruss.ts";
import {
  solveStructuralTruss,
  type StructuralTrussAnalysis,
} from "./TrussSolver.ts";

export interface TrussOptimizationOptions {
  maximumIterations?: number;
  unloadedForceRatio?: number;
  unloadedForceFloorNewtons?: number;
  penaltyWeight?: number;
}

export interface TrussOptimizationTraceEntry {
  iteration: number;
  action: "remove" | "resize" | "converged" | "infeasible";
  evaluatedMemberCount: number;
  removedMemberIds: string[];
  resizedMemberIds: string[];
  materialVolumeCubicMm: number;
  objective: number;
  maximumStressUtilization: number;
  maximumBucklingUtilization: number;
  maximumDisplacementUtilization: number;
  longCompressionPenalty: number;
  fragileAttachmentPenalty: number;
  unprintablePenalty: number;
}

export interface OptimizedTrussMember {
  memberId: string;
  diameterMm: number;
  volumeCubicMm: number;
  massKg: number;
  maximumAbsoluteForceNewtons: number;
  maximumStressUtilization: number;
  maximumBucklingUtilization: number;
  governingLoadCaseId: string;
}

export interface TrussOptimizationResult {
  schemaVersion: "1.0.0";
  status: "converged" | "infeasible" | "iteration-limit";
  sourceFingerprint: NormalizedStructuralDesign["sourceFingerprint"];
  policy: {
    maximumIterations: number;
    unloadedForceRatio: number;
    unloadedForceFloorNewtons: number;
    penaltyWeight: number;
    maximumPrintableDiameterMm: number;
    diameterRounding: "up-to-authored-increment";
    removalRule: "all-load-cases-low-force-or-long-compression";
  };
  optimizedCandidate: CandidateTruss;
  analysis: StructuralTrussAnalysis;
  members: OptimizedTrussMember[];
  trace: TrussOptimizationTraceEntry[];
  objective: number;
  objectiveBreakdown: TrussObjectiveBreakdown;
  materialVolumeCubicMm: number;
  materialMassKg: number;
  violations: string[];
}

interface MemberMetrics {
  memberId: string;
  maximumAbsoluteForceNewtons: number;
  maximumStressUtilization: number;
  maximumBucklingUtilization: number;
  hasCompression: boolean;
  governingLoadCaseId: string;
}

export interface TrussObjectiveBreakdown {
  objective: number;
  materialVolumeCubicMm: number;
  maximumStressUtilization: number;
  maximumBucklingUtilization: number;
  maximumDisplacementUtilization: number;
  longCompressionPenalty: number;
  fragileAttachmentPenalty: number;
  unprintablePenalty: number;
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function positiveOption(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and greater than zero.`);
}

function canonicalCandidate(candidate: CandidateTruss): CandidateTruss {
  const result = structuredClone(candidate);
  result.anchors.sort((left, right) => compareText(left.id, right.id));
  result.brackets.sort((left, right) => compareText(left.id, right.id));
  result.nodes.sort((left, right) => compareText(left.id, right.id));
  result.members.sort((left, right) => compareText(left.id, right.id));
  result.panelAttachments.sort((left, right) => compareText(left.panelId, right.panelId));
  result.rejectedMembers.sort((left, right) => compareText(left.id, right.id));
  for (const attachment of result.panelAttachments) {
    attachment.anchorIds.sort(compareText);
    attachment.bracketIds.sort(compareText);
    attachment.hubNodeIds.sort(compareText);
    attachment.localTieMemberIds.sort(compareText);
  }
  return result;
}

function memberMetrics(
  analysis: StructuralTrussAnalysis,
): Map<string, MemberMetrics> {
  const metrics = new Map<string, MemberMetrics>();
  for (const loadCase of analysis.loadCases) {
    for (const member of loadCase.members) {
      const existing = metrics.get(member.memberId);
      const combined = Math.max(member.utilization, member.bucklingUtilization);
      const existingCombined = existing
        ? Math.max(existing.maximumStressUtilization, existing.maximumBucklingUtilization)
        : -1;
      metrics.set(member.memberId, {
        memberId: member.memberId,
        maximumAbsoluteForceNewtons: Math.max(
          existing?.maximumAbsoluteForceNewtons ?? 0,
          Math.abs(member.axialForceNewtons),
        ),
        maximumStressUtilization: Math.max(
          existing?.maximumStressUtilization ?? 0,
          member.utilization,
        ),
        maximumBucklingUtilization: Math.max(
          existing?.maximumBucklingUtilization ?? 0,
          member.bucklingUtilization,
        ),
        hasCompression: (existing?.hasCompression ?? false) || member.forceType === "compression",
        governingLoadCaseId: !existing || combined > existingCombined ||
          (combined === existingCombined && compareText(loadCase.id, existing.governingLoadCaseId) < 0)
          ? loadCase.id
          : existing.governingLoadCaseId,
      });
    }
  }
  return metrics;
}

function memberVolume(member: CandidateTrussMember): number {
  return Math.PI * member.initialDiameterMm ** 2 / 4 * member.lengthMm;
}

function objectiveMetrics(
  normalized: NormalizedStructuralDesign,
  candidate: CandidateTruss,
  analysis: StructuralTrussAnalysis,
  metrics: Map<string, MemberMetrics>,
  penaltyWeight: number,
): TrussObjectiveBreakdown {
  const materialVolumeCubicMm = candidate.members.reduce(
    (sum, member) => sum + memberVolume(member),
    0,
  );
  let maximumStressUtilization = 0;
  let maximumBucklingUtilization = 0;
  let stressPenalty = 0;
  let bucklingPenalty = 0;
  let longCompressionPenalty = 0;
  let unprintablePenalty = 0;
  let fragileAttachmentPenalty = 0;
  const nodeById = new Map(candidate.nodes.map((node) => [node.id, node]));
  const interPanelMembersByPanel = new Map<string, number>();
  for (const member of candidate.members) {
    if (member.kind !== "inter-panel") continue;
    const startPanelId = nodeById.get(member.startNodeId)?.panelId;
    const endPanelId = nodeById.get(member.endNodeId)?.panelId;
    if (startPanelId) {
      interPanelMembersByPanel.set(
        startPanelId,
        (interPanelMembersByPanel.get(startPanelId) ?? 0) + 1,
      );
    }
    if (endPanelId) {
      interPanelMembersByPanel.set(
        endPanelId,
        (interPanelMembersByPanel.get(endPanelId) ?? 0) + 1,
      );
    }
  }
  if (candidate.panelAttachments.length > 1) {
    for (const attachment of candidate.panelAttachments) {
      const shortage = Math.max(
        0,
        candidate.policy.requiredInterPanelPaths -
          (interPanelMembersByPanel.get(attachment.panelId) ?? 0),
      );
      fragileAttachmentPenalty += shortage ** 2;
    }
  }
  const maximumForce = Math.max(
    1e-12,
    ...Array.from(metrics.values(), ({ maximumAbsoluteForceNewtons }) =>
      maximumAbsoluteForceNewtons
    ),
  );
  for (const member of candidate.members) {
    const memberMetric = metrics.get(member.id)!;
    maximumStressUtilization = Math.max(
      maximumStressUtilization,
      memberMetric.maximumStressUtilization,
    );
    maximumBucklingUtilization = Math.max(
      maximumBucklingUtilization,
      memberMetric.maximumBucklingUtilization,
    );
    stressPenalty += Math.max(0, memberMetric.maximumStressUtilization - 1) ** 2;
    bucklingPenalty += Math.max(0, memberMetric.maximumBucklingUtilization - 1) ** 2;
    if (
      memberMetric.hasCompression &&
      member.lengthMm > normalized.design.fabrication.maximumUnsupportedCompressionLengthMm
    ) {
      const excess = member.lengthMm /
        normalized.design.fabrication.maximumUnsupportedCompressionLengthMm - 1;
      longCompressionPenalty += excess ** 2 *
        memberMetric.maximumAbsoluteForceNewtons / maximumForce;
    }
    const fabrication = normalized.design.fabrication;
    if (member.initialDiameterMm < fabrication.minimumMemberDiameterMm) {
      unprintablePenalty += (
        (fabrication.minimumMemberDiameterMm - member.initialDiameterMm) /
        fabrication.memberDiameterIncrementMm
      ) ** 2;
    } else if (member.initialDiameterMm > fabrication.maximumMemberDiameterMm) {
      unprintablePenalty += (
        (member.initialDiameterMm - fabrication.maximumMemberDiameterMm) /
        fabrication.memberDiameterIncrementMm
      ) ** 2;
    } else {
      const steps = (member.initialDiameterMm - fabrication.minimumMemberDiameterMm) /
        fabrication.memberDiameterIncrementMm;
      unprintablePenalty += (steps - Math.round(steps)) ** 2;
    }
  }
  const maximumDisplacement = Math.max(
    ...analysis.loadCases.map(({ maximumDisplacementMm }) => maximumDisplacementMm),
  );
  const maximumDisplacementUtilization = maximumDisplacement /
    normalized.design.maximumDisplacementMm;
  const displacementPenalty = Math.max(0, maximumDisplacementUtilization - 1) ** 2;
  return {
    objective: materialVolumeCubicMm + penaltyWeight *
      (stressPenalty + bucklingPenalty + displacementPenalty +
        longCompressionPenalty + fragileAttachmentPenalty + unprintablePenalty),
    materialVolumeCubicMm,
    maximumStressUtilization,
    maximumBucklingUtilization,
    maximumDisplacementUtilization,
    longCompressionPenalty,
    fragileAttachmentPenalty,
    unprintablePenalty,
  };
}

function roundDiameterUp(
  value: number,
  minimum: number,
  maximum: number,
  increment: number,
): number {
  const steps = Math.ceil(Math.max(0, value - minimum) / increment - 1e-12);
  return Math.min(maximum, Number((minimum + steps * increment).toFixed(9)));
}

function traceEntry(
  iteration: number,
  action: TrussOptimizationTraceEntry["action"],
  evaluatedMemberCount: number,
  objective: TrussObjectiveBreakdown,
  removedMemberIds: string[] = [],
  resizedMemberIds: string[] = [],
): TrussOptimizationTraceEntry {
  return {
    iteration,
    action,
    evaluatedMemberCount,
    removedMemberIds,
    resizedMemberIds,
    ...objective,
  };
}

export function optimizeStructuralTruss(
  normalized: NormalizedStructuralDesign,
  candidate: CandidateTruss,
  options: TrussOptimizationOptions = {},
): TrussOptimizationResult {
  const maximumIterations = options.maximumIterations ?? 12;
  const unloadedForceRatio = options.unloadedForceRatio ?? 1e-3;
  const unloadedForceFloorNewtons = options.unloadedForceFloorNewtons ?? 1e-6;
  const penaltyWeight = options.penaltyWeight ?? 1e6;
  for (const [value, label] of [
    [maximumIterations, "Maximum optimization iterations"],
    [unloadedForceRatio, "Unloaded force ratio"],
    [unloadedForceFloorNewtons, "Unloaded force floor"],
    [penaltyWeight, "Optimization penalty weight"],
  ] as const) positiveOption(value, label);
  if (!Number.isInteger(maximumIterations)) throw new Error("Maximum optimization iterations must be an integer.");
  if (unloadedForceRatio > 1) throw new Error("Unloaded force ratio must not be greater than 1.");
  const fabrication = normalized.design.fabrication;
  const maximumPrintableDiameterMm = Number((
    fabrication.minimumMemberDiameterMm +
    Math.floor(
      (fabrication.maximumMemberDiameterMm - fabrication.minimumMemberDiameterMm) /
        fabrication.memberDiameterIncrementMm + 1e-12,
    ) * fabrication.memberDiameterIncrementMm
  ).toFixed(9));
  let working = canonicalCandidate(candidate);
  validateCandidateTruss(working);
  const trace: TrussOptimizationTraceEntry[] = [];
  let stationary = false;
  let stationaryIteration = 0;
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const analysis = solveStructuralTruss(normalized, working);
    const metrics = memberMetrics(analysis);
    const objective = objectiveMetrics(normalized, working, analysis, metrics, penaltyWeight);
    const maximumForce = Math.max(
      0,
      ...Array.from(metrics.values(), ({ maximumAbsoluteForceNewtons }) =>
        maximumAbsoluteForceNewtons
      ),
    );
    const unloadedThreshold = Math.max(
      unloadedForceFloorNewtons,
      maximumForce * unloadedForceRatio,
    );
    const removable = working.members.filter((member) => {
      if (member.kind !== "inter-panel") return false;
      const metric = metrics.get(member.id)!;
      return metric.maximumAbsoluteForceNewtons <= unloadedThreshold ||
        (metric.hasCompression && member.lengthMm >
          normalized.design.fabrication.maximumUnsupportedCompressionLengthMm);
    });
    if (removable.length > 0) {
      const restorable = [...removable].sort((left, right) =>
        memberVolume(left) - memberVolume(right) || compareText(left.id, right.id)
      );
      const removeIds = new Set(removable.map(({ id }) => id));
      const retained = working.members.filter(({ id }) => !removeIds.has(id));
      const candidateWithRestoredPrefix = (count: number): CandidateTruss => {
        const proposed = structuredClone(working);
        proposed.members = [
          ...retained,
          ...restorable.slice(0, count),
        ].map((member) => structuredClone(member))
          .sort((left, right) => compareText(left.id, right.id));
        return proposed;
      };
      const canMeetHardLimits = (proposed: CandidateTruss): boolean => {
        try {
          validateCandidateTruss(proposed);
          const capacityCandidate = structuredClone(proposed);
          for (const member of capacityCandidate.members) {
            member.initialDiameterMm =
              maximumPrintableDiameterMm;
          }
          const capacityAnalysis = solveStructuralTruss(normalized, capacityCandidate);
          const capacityObjective = objectiveMetrics(
            normalized,
            capacityCandidate,
            capacityAnalysis,
            memberMetrics(capacityAnalysis),
            penaltyWeight,
          );
          return capacityObjective.maximumStressUtilization <= 1 + 1e-9 &&
            capacityObjective.maximumBucklingUtilization <= 1 + 1e-9 &&
            capacityObjective.maximumDisplacementUtilization <= 1 + 1e-9 &&
            capacityObjective.fragileAttachmentPenalty <= 1e-12;
        } catch {
          return false;
        }
      };
      let lower = 0;
      let upper = restorable.length;
      if (!canMeetHardLimits(candidateWithRestoredPrefix(lower))) {
        while (lower + 1 < upper) {
          const middle = Math.floor((lower + upper) / 2);
          if (canMeetHardLimits(candidateWithRestoredPrefix(middle))) upper = middle;
          else lower = middle;
        }
      }
      const restoreCount = canMeetHardLimits(candidateWithRestoredPrefix(lower))
        ? lower
        : upper;
      const proposed = candidateWithRestoredPrefix(restoreCount);
      const removedMemberIds = restorable.slice(restoreCount).map(({ id }) => id);
      if (removedMemberIds.length > 0 && canMeetHardLimits(proposed)) {
        trace.push(traceEntry(
          iteration,
          "remove",
          working.members.length,
          objective,
          removedMemberIds.sort(compareText),
        ));
        working = proposed;
        continue;
      }
    }
    const displacementFactor = Math.sqrt(Math.max(1, objective.maximumDisplacementUtilization));
    const resizedMemberIds: string[] = [];
    for (const member of working.members) {
      const metric = metrics.get(member.id)!;
      const requiredFactor = Math.max(
        1,
        Math.sqrt(metric.maximumStressUtilization),
        Math.pow(metric.maximumBucklingUtilization, 0.25),
        displacementFactor,
      );
      const target = roundDiameterUp(
        member.initialDiameterMm * requiredFactor,
        normalized.design.fabrication.minimumMemberDiameterMm,
        maximumPrintableDiameterMm,
        normalized.design.fabrication.memberDiameterIncrementMm,
      );
      if (Math.abs(target - member.initialDiameterMm) > 1e-9) {
        member.initialDiameterMm = target;
        resizedMemberIds.push(member.id);
      }
    }
    if (resizedMemberIds.length > 0) {
      trace.push(traceEntry(
        iteration,
        "resize",
        working.members.length,
        objective,
        [],
        resizedMemberIds.sort(compareText),
      ));
      continue;
    }
    stationary = true;
    stationaryIteration = iteration;
    break;
  }
  const analysis = solveStructuralTruss(normalized, working);
  const metrics = memberMetrics(analysis);
  const finalObjective = objectiveMetrics(normalized, working, analysis, metrics, penaltyWeight);
  const violations: string[] = [];
  if (finalObjective.maximumStressUtilization > 1 + 1e-9) {
    violations.push(`Stress utilization is ${finalObjective.maximumStressUtilization.toFixed(6)}.`);
  }
  if (finalObjective.maximumBucklingUtilization > 1 + 1e-9) {
    violations.push(`Buckling utilization is ${finalObjective.maximumBucklingUtilization.toFixed(6)}.`);
  }
  if (finalObjective.maximumDisplacementUtilization > 1 + 1e-9) {
    violations.push(`Displacement utilization is ${finalObjective.maximumDisplacementUtilization.toFixed(6)}.`);
  }
  if (finalObjective.longCompressionPenalty > 1e-12) {
    violations.push("One or more compression members exceed the unsupported length limit.");
  }
  if (finalObjective.fragileAttachmentPenalty > 1e-12) {
    violations.push("One or more panel attachments have a fragile load path.");
  }
  if (finalObjective.unprintablePenalty > 1e-12) {
    violations.push("One or more member diameters do not satisfy printable increments.");
  }
  const status: TrussOptimizationResult["status"] = !stationary
    ? "iteration-limit"
    : violations.length > 0 ? "infeasible" : "converged";
  if (stationary) {
    trace.push(traceEntry(
      stationaryIteration,
      status === "converged" ? "converged" : "infeasible",
      working.members.length,
      finalObjective,
    ));
  }
  const material = normalized.design.material;
  const memberById = new Map(working.members.map((member) => [member.id, member]));
  const members = [...metrics.values()].sort((left, right) => compareText(left.memberId, right.memberId))
    .map((metric): OptimizedTrussMember => {
      const member = memberById.get(metric.memberId)!;
      const volumeCubicMm = memberVolume(member);
      return {
        ...metric,
        diameterMm: member.initialDiameterMm,
        volumeCubicMm,
        massKg: volumeCubicMm * 1e-9 * material.densityKgPerCubicMeter,
      };
    });
  const materialVolumeCubicMm = members.reduce((sum, member) => sum + member.volumeCubicMm, 0);
  return {
    schemaVersion: "1.0.0",
    status,
    sourceFingerprint: { ...normalized.sourceFingerprint },
    policy: {
      maximumIterations,
      unloadedForceRatio,
      unloadedForceFloorNewtons,
      penaltyWeight,
      maximumPrintableDiameterMm,
      diameterRounding: "up-to-authored-increment",
      removalRule: "all-load-cases-low-force-or-long-compression",
    },
    optimizedCandidate: working,
    analysis,
    members,
    trace,
    objective: finalObjective.objective,
    objectiveBreakdown: finalObjective,
    materialVolumeCubicMm,
    materialMassKg: materialVolumeCubicMm * 1e-9 * material.densityKgPerCubicMeter,
    violations,
  };
}
