import type {
  NormalizedStructuralDesign,
  StructuralAxis,
  StructuralVector,
} from "../sculpture/StructuralDesign.ts";
import {
  validateCandidateTruss,
  type CandidateTruss,
} from "./CandidateTruss.ts";

export interface LinearTrussNode {
  id: string;
  positionMm: StructuralVector;
}

export interface LinearTrussMember {
  id: string;
  startNodeId: string;
  endNodeId: string;
  areaMm2: number;
  youngsModulusMpa: number;
  yieldStrengthMpa: number;
  secondMomentAreaMm4: number;
  safetyFactor: number;
}

export interface LinearTrussSupport {
  nodeId: string;
  constrainedTranslations: StructuralAxis[];
}

export interface LinearTrussLoadCase {
  id: string;
  nodalLoads: Array<{ nodeId: string; forceNewtons: StructuralVector }>;
}

export interface LinearTrussModel {
  nodes: LinearTrussNode[];
  members: LinearTrussMember[];
  supports: LinearTrussSupport[];
  loadCases: LinearTrussLoadCase[];
}

export interface TrussNodeResult {
  nodeId: string;
  appliedForceNewtons: StructuralVector;
  displacementMm: StructuralVector;
  reactionNewtons: StructuralVector;
}

export interface TrussMemberResult {
  memberId: string;
  axialForceNewtons: number;
  forceType: "tension" | "compression" | "unloaded";
  stressMpa: number;
  utilization: number;
  eulerBucklingCapacityNewtons: number;
  bucklingUtilization: number;
}

export interface TrussLoadCaseResult {
  id: string;
  nodes: TrussNodeResult[];
  members: TrussMemberResult[];
  maximumDisplacementMm: number;
  maximumDisplacementNodeId: string;
  equilibriumResidualNewtons: StructuralVector;
}

export interface LinearTrussResult {
  policy: {
    units: "N-mm-MPa";
    degreesOfFreedomPerNode: 3;
    factorization: "cholesky";
    relativePivotTolerance: number;
    relativeResidualTolerance: number;
    memberEndCondition: "pinned-pinned";
  };
  loadCases: TrussLoadCaseResult[];
}

export interface StructuralTrussAnalysis extends LinearTrussResult {
  schemaVersion: "1.0.0";
  sourceFingerprint: NormalizedStructuralDesign["sourceFingerprint"];
  governingMembers: Array<TrussMemberResult & { governingLoadCaseId: string }>;
  warnings: NormalizedStructuralDesign["warnings"];
  disclaimer: "Load-path guidance only; not engineering certification.";
}

export class TrussSolveError extends Error {
  constructor(
    public readonly code:
      | "INVALID_MODEL"
      | "SINGULAR_SYSTEM"
      | "NUMERICAL_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "TrussSolveError";
  }
}

const AXES: StructuralAxis[] = ["x", "y", "z"];
const RELATIVE_PIVOT_TOLERANCE = 1e-10;
const RELATIVE_RESIDUAL_TOLERANCE = 1e-8;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function vectorLength(value: StructuralVector): number {
  return Math.hypot(...value);
}

function subtract(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function addInPlace(target: StructuralVector, value: StructuralVector): void {
  target[0] += value[0];
  target[1] += value[1];
  target[2] += value[2];
}

function scale(value: StructuralVector, amount: number): StructuralVector {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function dot(left: StructuralVector, right: StructuralVector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TrussSolveError("INVALID_MODEL", `${label} must be finite and greater than zero.`);
  }
}

function requireFiniteResult(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TrussSolveError("NUMERICAL_FAILURE", `${label} is not finite.`);
  }
}

function requireFiniteVector(value: StructuralVector, label: string): void {
  if (value.some((component) => !Number.isFinite(component))) {
    throw new TrussSolveError("NUMERICAL_FAILURE", `${label} contains a non-finite value.`);
  }
}

function factorCholesky(matrix: Float64Array, size: number): Float64Array {
  const factor = new Float64Array(matrix.length);
  let maximumDiagonal = 0;
  for (let index = 0; index < size; index += 1) {
    maximumDiagonal = Math.max(maximumDiagonal, Math.abs(matrix[index * size + index]!));
  }
  if (size > 0 && maximumDiagonal === 0) {
    throw new TrussSolveError(
      "SINGULAR_SYSTEM",
      "Truss stiffness is zero. Add supports and members that constrain all translations.",
    );
  }
  const tolerance = maximumDiagonal * RELATIVE_PIVOT_TOLERANCE;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row * size + column]!;
      for (let inner = 0; inner < column; inner += 1) {
        value -= factor[row * size + inner]! * factor[column * size + inner]!;
      }
      if (row === column) {
        if (!Number.isFinite(value) || value <= tolerance) {
          throw new TrussSolveError(
            "SINGULAR_SYSTEM",
            `Truss stiffness is singular at free degree of freedom ${row}. ` +
            "The supports are insufficient or the members contain a rigid-body mechanism.",
          );
        }
        factor[row * size + column] = Math.sqrt(value);
      } else {
        factor[row * size + column] = value / factor[column * size + column]!;
      }
    }
  }
  return factor;
}

function solveCholesky(factor: Float64Array, rightHandSide: Float64Array): Float64Array {
  const size = rightHandSide.length;
  const intermediate = new Float64Array(size);
  for (let row = 0; row < size; row += 1) {
    let value = rightHandSide[row]!;
    for (let column = 0; column < row; column += 1) {
      value -= factor[row * size + column]! * intermediate[column]!;
    }
    intermediate[row] = value / factor[row * size + row]!;
  }
  const solution = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = intermediate[row]!;
    for (let column = row + 1; column < size; column += 1) {
      value -= factor[column * size + row]! * solution[column]!;
    }
    solution[row] = value / factor[row * size + row]!;
  }
  return solution;
}

function residualRatio(
  matrix: Float64Array,
  solution: Float64Array,
  rightHandSide: Float64Array,
): number {
  const size = solution.length;
  let maximumResidual = 0;
  let maximumLoad = 0;
  for (let row = 0; row < size; row += 1) {
    let value = -rightHandSide[row]!;
    maximumLoad = Math.max(maximumLoad, Math.abs(rightHandSide[row]!));
    for (let column = 0; column < size; column += 1) {
      value += matrix[row * size + column]! * solution[column]!;
    }
    maximumResidual = Math.max(maximumResidual, Math.abs(value));
  }
  if (!Number.isFinite(maximumResidual) || !Number.isFinite(maximumLoad)) return Infinity;
  if (maximumLoad === 0) return maximumResidual === 0 ? 0 : Infinity;
  return maximumResidual / maximumLoad;
}

export function solveLinearTruss(model: LinearTrussModel): LinearTrussResult {
  const nodes = [...model.nodes].sort((left, right) => compareText(left.id, right.id));
  const members = [...model.members].sort((left, right) => compareText(left.id, right.id));
  const loadCases = [...model.loadCases].sort((left, right) => compareText(left.id, right.id));
  if (nodes.length === 0) throw new TrussSolveError("INVALID_MODEL", "Truss requires at least one node.");
  if (members.length === 0) throw new TrussSolveError("INVALID_MODEL", "Truss requires at least one member.");
  if (loadCases.length === 0) throw new TrussSolveError("INVALID_MODEL", "Truss requires at least one load case.");
  const nodeIndex = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    if (nodeIndex.has(node.id)) throw new TrussSolveError("INVALID_MODEL", `Node id ${node.id} is duplicated.`);
    if (node.positionMm.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new TrussSolveError("INVALID_MODEL", `Node ${node.id} has a non-finite position.`);
    }
    nodeIndex.set(node.id, index);
  }
  const memberIds = new Set<string>();
  const memberData = members.map((member) => {
    if (memberIds.has(member.id)) throw new TrussSolveError("INVALID_MODEL", `Member id ${member.id} is duplicated.`);
    memberIds.add(member.id);
    const startIndex = nodeIndex.get(member.startNodeId);
    const endIndex = nodeIndex.get(member.endNodeId);
    if (startIndex === undefined || endIndex === undefined) {
      throw new TrussSolveError("INVALID_MODEL", `Member ${member.id} references an unknown node.`);
    }
    finitePositive(member.areaMm2, `Member ${member.id} area`);
    finitePositive(member.youngsModulusMpa, `Member ${member.id} Young's modulus`);
    finitePositive(member.yieldStrengthMpa, `Member ${member.id} yield strength`);
    finitePositive(member.secondMomentAreaMm4, `Member ${member.id} second moment of area`);
    finitePositive(member.safetyFactor, `Member ${member.id} safety factor`);
    const delta = subtract(nodes[endIndex]!.positionMm, nodes[startIndex]!.positionMm);
    const lengthMm = vectorLength(delta);
    if (lengthMm <= 1e-9) {
      throw new TrussSolveError("INVALID_MODEL", `Member ${member.id} has zero length.`);
    }
    return {
      member,
      startIndex,
      endIndex,
      lengthMm,
      direction: scale(delta, 1 / lengthMm),
    };
  });
  const constrained = new Set<number>();
  for (const support of [...model.supports].sort((left, right) => compareText(left.nodeId, right.nodeId))) {
    const index = nodeIndex.get(support.nodeId);
    if (index === undefined) throw new TrussSolveError("INVALID_MODEL", `Support references unknown node ${support.nodeId}.`);
    for (const axis of support.constrainedTranslations) {
      const axisIndex = AXES.indexOf(axis);
      if (axisIndex < 0) throw new TrussSolveError("INVALID_MODEL", `Support ${support.nodeId} has an invalid translation axis.`);
      constrained.add(index * 3 + axisIndex);
    }
  }
  if (constrained.size === 0) {
    throw new TrussSolveError(
      "SINGULAR_SYSTEM",
      "Truss has no constrained translations. Define real supports before analysis.",
    );
  }
  const totalDofs = nodes.length * 3;
  const freeDofs = Array.from({ length: totalDofs }, (_, index) => index)
    .filter((index) => !constrained.has(index));
  const freeIndex = new Map(freeDofs.map((globalIndex, index) => [globalIndex, index]));
  const freeSize = freeDofs.length;
  const stiffness = new Float64Array(freeSize * freeSize);
  for (const data of memberData) {
    const coefficient = data.member.youngsModulusMpa * data.member.areaMm2 / data.lengthMm;
    requireFiniteResult(coefficient, `Member ${data.member.id} axial stiffness`);
    for (let startAxis = 0; startAxis < 3; startAxis += 1) {
      for (let endAxis = 0; endAxis < 3; endAxis += 1) {
        const directional = coefficient * data.direction[startAxis]! * data.direction[endAxis]!;
        for (const [rowNode, rowSign] of [[data.startIndex, 1], [data.endIndex, -1]] as const) {
          for (const [columnNode, columnSign] of [[data.startIndex, 1], [data.endIndex, -1]] as const) {
            const row = freeIndex.get(rowNode * 3 + startAxis);
            const column = freeIndex.get(columnNode * 3 + endAxis);
            if (row !== undefined && column !== undefined) {
              const stiffnessIndex = row * freeSize + column;
              stiffness[stiffnessIndex] = stiffness[stiffnessIndex]! +
                directional * rowSign * columnSign;
            }
          }
        }
      }
    }
  }
  const factor = factorCholesky(stiffness, freeSize);
  const results: TrussLoadCaseResult[] = [];
  const loadCaseIds = new Set<string>();
  for (const loadCase of loadCases) {
    if (loadCaseIds.has(loadCase.id)) throw new TrussSolveError("INVALID_MODEL", `Load case id ${loadCase.id} is duplicated.`);
    loadCaseIds.add(loadCase.id);
    const forces = Array.from({ length: nodes.length }, (): StructuralVector => [0, 0, 0]);
    for (const load of [...loadCase.nodalLoads].sort((left, right) =>
      compareText(left.nodeId, right.nodeId) ||
      left.forceNewtons[0] - right.forceNewtons[0] ||
      left.forceNewtons[1] - right.forceNewtons[1] ||
      left.forceNewtons[2] - right.forceNewtons[2]
    )) {
      const index = nodeIndex.get(load.nodeId);
      if (index === undefined) throw new TrussSolveError("INVALID_MODEL", `Load case ${loadCase.id} references unknown node ${load.nodeId}.`);
      if (load.forceNewtons.some((component) => !Number.isFinite(component))) {
        throw new TrussSolveError("INVALID_MODEL", `Load case ${loadCase.id} has a non-finite force.`);
      }
      addInPlace(forces[index]!, load.forceNewtons);
      requireFiniteVector(forces[index]!, `Load case ${loadCase.id} accumulated force`);
    }
    const rightHandSide = new Float64Array(freeSize);
    for (const [index, globalDof] of freeDofs.entries()) {
      rightHandSide[index] = forces[Math.floor(globalDof / 3)]![globalDof % 3]!;
    }
    const freeSolution = solveCholesky(factor, rightHandSide);
    if (freeSolution.some((value) => !Number.isFinite(value))) {
      throw new TrussSolveError(
        "NUMERICAL_FAILURE",
        `Load case ${loadCase.id} produced a non-finite displacement.`,
      );
    }
    const relativeResidual = residualRatio(stiffness, freeSolution, rightHandSide);
    if (!Number.isFinite(relativeResidual) || relativeResidual > RELATIVE_RESIDUAL_TOLERANCE) {
      throw new TrussSolveError(
        "NUMERICAL_FAILURE",
        `Load case ${loadCase.id} did not satisfy the stiffness-equation residual tolerance.`,
      );
    }
    const displacements = Array.from({ length: nodes.length }, (): StructuralVector => [0, 0, 0]);
    for (const [index, globalDof] of freeDofs.entries()) {
      displacements[Math.floor(globalDof / 3)]![globalDof % 3] = freeSolution[index]!;
    }
    const reactions = forces.map((force): StructuralVector => [-force[0], -force[1], -force[2]]);
    const memberResults = memberData.map((data): TrussMemberResult => {
      const relativeDisplacement = subtract(
        displacements[data.endIndex]!,
        displacements[data.startIndex]!,
      );
      const extensionMm = dot(relativeDisplacement, data.direction);
      const axialForceNewtons =
        data.member.youngsModulusMpa * data.member.areaMm2 / data.lengthMm * extensionMm;
      addInPlace(reactions[data.startIndex]!, scale(data.direction, -axialForceNewtons));
      addInPlace(reactions[data.endIndex]!, scale(data.direction, axialForceNewtons));
      const stressMpa = axialForceNewtons / data.member.areaMm2;
      const utilization = Math.abs(stressMpa) * data.member.safetyFactor /
        data.member.yieldStrengthMpa;
      const eulerBucklingCapacityNewtons = Math.PI ** 2 *
        data.member.youngsModulusMpa * data.member.secondMomentAreaMm4 /
        data.lengthMm ** 2;
      const bucklingUtilization = axialForceNewtons < 0
        ? Math.abs(axialForceNewtons) * data.member.safetyFactor /
          eulerBucklingCapacityNewtons
        : 0;
      for (const [value, label] of [
        [axialForceNewtons, "axial force"],
        [stressMpa, "stress"],
        [utilization, "yield utilization"],
        [eulerBucklingCapacityNewtons, "Euler buckling capacity"],
        [bucklingUtilization, "buckling utilization"],
      ] as const) requireFiniteResult(value, `Member ${data.member.id} ${label}`);
      requireFiniteVector(reactions[data.startIndex]!, `Load case ${loadCase.id} reaction`);
      requireFiniteVector(reactions[data.endIndex]!, `Load case ${loadCase.id} reaction`);
      return {
        memberId: data.member.id,
        axialForceNewtons,
        forceType: Math.abs(axialForceNewtons) <= 1e-9
          ? "unloaded"
          : axialForceNewtons > 0 ? "tension" : "compression",
        stressMpa,
        utilization,
        eulerBucklingCapacityNewtons,
        bucklingUtilization,
      };
    });
    let maximumDisplacementMm = -1;
    let maximumDisplacementNodeId = nodes[0]!.id;
    for (const [index, displacement] of displacements.entries()) {
      requireFiniteVector(displacement, `Load case ${loadCase.id} displacement`);
      const magnitude = vectorLength(displacement);
      if (magnitude > maximumDisplacementMm) {
        maximumDisplacementMm = magnitude;
        maximumDisplacementNodeId = nodes[index]!.id;
      }
    }
    const equilibriumResidualNewtons: StructuralVector = [0, 0, 0];
    for (const [index, reaction] of reactions.entries()) {
      if (constrained.has(index * 3)) equilibriumResidualNewtons[0] += reaction[0];
      if (constrained.has(index * 3 + 1)) equilibriumResidualNewtons[1] += reaction[1];
      if (constrained.has(index * 3 + 2)) equilibriumResidualNewtons[2] += reaction[2];
      addInPlace(equilibriumResidualNewtons, forces[index]!);
    }
    requireFiniteVector(
      equilibriumResidualNewtons,
      `Load case ${loadCase.id} equilibrium residual`,
    );
    results.push({
      id: loadCase.id,
      nodes: nodes.map((node, index) => ({
        nodeId: node.id,
        appliedForceNewtons: forces[index]!,
        displacementMm: displacements[index]!,
        reactionNewtons: reactions[index]!,
      })),
      members: memberResults,
      maximumDisplacementMm,
      maximumDisplacementNodeId,
      equilibriumResidualNewtons,
    });
  }
  return {
    policy: {
      units: "N-mm-MPa",
      degreesOfFreedomPerNode: 3,
      factorization: "cholesky",
      relativePivotTolerance: RELATIVE_PIVOT_TOLERANCE,
      relativeResidualTolerance: RELATIVE_RESIDUAL_TOLERANCE,
      memberEndCondition: "pinned-pinned",
    },
    loadCases: results,
  };
}

function circleProperties(diameterMm: number): { areaMm2: number; secondMomentAreaMm4: number } {
  return {
    areaMm2: Math.PI * diameterMm ** 2 / 4,
    secondMomentAreaMm4: Math.PI * diameterMm ** 4 / 64,
  };
}

export function compileStructuralTrussModel(
  normalized: NormalizedStructuralDesign,
  candidate: CandidateTruss,
): LinearTrussModel {
  validateCandidateTruss(candidate);
  if (candidate.sourceFingerprint.value !== normalized.sourceFingerprint.value) {
    throw new TrussSolveError("INVALID_MODEL", "Candidate truss fingerprint does not match structural inputs.");
  }
  const nodes: LinearTrussNode[] = candidate.nodes.map(({ id, positionMm }) => ({
    id,
    positionMm: [...positionMm],
  }));
  const nodeByAnchor = new Map(candidate.nodes.map((node) => [node.anchorId, node]));
  const nodesByPanel = new Map<string, typeof candidate.nodes>();
  for (const node of candidate.nodes) {
    const panelNodes = nodesByPanel.get(node.panelId) ?? [];
    panelNodes.push(node);
    nodesByPanel.set(node.panelId, panelNodes);
  }
  for (const panelNodes of nodesByPanel.values()) panelNodes.sort((left, right) => compareText(left.id, right.id));
  const material = normalized.design.material;
  const members: LinearTrussMember[] = candidate.members.map((member) => {
    const properties = circleProperties(member.initialDiameterMm);
    return {
      id: member.id,
      startNodeId: member.startNodeId,
      endNodeId: member.endNodeId,
      areaMm2: properties.areaMm2,
      secondMomentAreaMm4: properties.secondMomentAreaMm4,
      youngsModulusMpa: material.youngsModulusMpa,
      yieldStrengthMpa: material.yieldStrengthMpa,
      safetyFactor: normalized.design.safetyFactor,
    };
  });
  const supports = normalized.supports.map((support): LinearTrussSupport => {
    const node = nodeByAnchor.get(support.anchorId);
    if (!node) throw new TrussSolveError("INVALID_MODEL", `Support ${support.id} has no candidate hub for ${support.anchorId}.`);
    return {
      nodeId: node.id,
      constrainedTranslations: [...support.constrainedTranslations],
    };
  });
  const candidateNodeById = new Map(candidate.nodes.map((node) => [node.id, node]));
  const candidateMemberById = new Map(candidate.members.map((member) => [member.id, member]));
  const loadCases: LinearTrussLoadCase[] = normalized.loadCases.map((loadCase) => {
    const nodalLoads: LinearTrussLoadCase["nodalLoads"] = [];
    if (loadCase.kind === "gravity") {
      for (const panel of normalized.panels) {
        const panelNodes = nodesByPanel.get(panel.id) ?? [];
        if (panelNodes.length === 0) throw new TrussSolveError("INVALID_MODEL", `Panel ${panel.id} has no candidate hubs.`);
        const force = scale(
          loadCase.direction,
          panel.massKg * loadCase.accelerationMetersPerSecondSquared / panelNodes.length,
        );
        for (const node of panelNodes) nodalLoads.push({ nodeId: node.id, forceNewtons: force });
      }
      for (const member of members) {
        const candidateMember = candidateMemberById.get(member.id)!;
        const massKg = material.densityKgPerCubicMeter * member.areaMm2 *
          candidateMember.lengthMm * 1e-9;
        const halfWeight = scale(
          loadCase.direction,
          massKg * loadCase.accelerationMetersPerSecondSquared / 2,
        );
        nodalLoads.push({ nodeId: member.startNodeId, forceNewtons: halfWeight });
        nodalLoads.push({ nodeId: member.endNodeId, forceNewtons: halfWeight });
      }
    } else {
      const panelNodes = nodesByPanel.get(loadCase.panelId) ?? [];
      if (panelNodes.length === 0) throw new TrussSolveError("INVALID_MODEL", `Load case ${loadCase.id} panel has no candidate hubs.`);
      if (loadCase.kind === "panel-face-force") {
        const share = scale(loadCase.forceNewtons, 1 / panelNodes.length);
        for (const node of panelNodes) nodalLoads.push({ nodeId: node.id, forceNewtons: share });
      } else {
        const nearest = [...panelNodes].sort((left, right) => {
          const leftDistance = vectorLength(subtract(left.positionMm, loadCase.applicationPointMm));
          const rightDistance = vectorLength(subtract(right.positionMm, loadCase.applicationPointMm));
          return leftDistance - rightDistance || compareText(left.id, right.id);
        })[0]!;
        nodalLoads.push({ nodeId: nearest.id, forceNewtons: [...loadCase.forceNewtons] });
      }
    }
    return { id: loadCase.id, nodalLoads };
  });
  for (const support of supports) {
    if (!candidateNodeById.has(support.nodeId)) {
      throw new TrussSolveError("INVALID_MODEL", `Support references absent node ${support.nodeId}.`);
    }
  }
  return { nodes, members, supports, loadCases };
}

export function solveStructuralTruss(
  normalized: NormalizedStructuralDesign,
  candidate: CandidateTruss,
): StructuralTrussAnalysis {
  const result = solveLinearTruss(compileStructuralTrussModel(normalized, candidate));
  const memberResultsByCase = result.loadCases.map((loadCase) => ({
    loadCaseId: loadCase.id,
    memberById: new Map(loadCase.members.map((member) => [member.memberId, member])),
  }));
  const governingMembers = candidate.members.map((member) => {
    const cases = memberResultsByCase.map((loadCase) => ({
      loadCaseId: loadCase.loadCaseId,
      result: loadCase.memberById.get(member.id)!,
    }));
    cases.sort((left, right) => {
      const leftValue = Math.max(left.result.utilization, left.result.bucklingUtilization);
      const rightValue = Math.max(right.result.utilization, right.result.bucklingUtilization);
      return rightValue - leftValue || compareText(left.loadCaseId, right.loadCaseId);
    });
    return { ...cases[0]!.result, governingLoadCaseId: cases[0]!.loadCaseId };
  }).sort((left, right) => compareText(left.memberId, right.memberId));
  return {
    schemaVersion: "1.0.0",
    sourceFingerprint: { ...normalized.sourceFingerprint },
    ...result,
    governingMembers,
    warnings: structuredClone(normalized.warnings),
    disclaimer: "Load-path guidance only; not engineering certification.",
  };
}
