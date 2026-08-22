import type {
  NormalizedStructuralAnchor,
  NormalizedStructuralDesign,
  NormalizedStructuralPanel,
  StructuralVector,
} from "../sculpture/StructuralDesign.ts";

export interface CandidateTrussPolicy {
  schemaVersion: "1.0.0";
  maximumCandidateMemberLengthMm: number;
  minimumNodeSeparationMm: number;
  pcbEnvelopeClearanceMm: number;
  requiredInterPanelPaths: 2;
}

export interface CandidateTrussBracket {
  id: string;
  panelId: string;
  anchorId: string;
  hubNodeId: string;
  anchorPositionMm: StructuralVector;
  hubPositionMm: StructuralVector;
  lengthMm: number;
}

export interface CandidateTrussNode {
  id: string;
  kind: "anchor-hub";
  panelId: string;
  anchorId: string;
  positionMm: StructuralVector;
}

export interface CandidateTrussMember {
  id: string;
  kind: "panel-tie" | "inter-panel";
  startNodeId: string;
  endNodeId: string;
  lengthMm: number;
  initialDiameterMm: number;
}

export interface RejectedCandidateMember {
  id: string;
  startNodeId: string;
  endNodeId: string;
  lengthMm: number;
  reason: "member-too-long" | "pcb-envelope-collision";
  blockingPanelId?: string;
}

export interface CandidatePanelAttachment {
  panelId: string;
  anchorIds: string[];
  bracketIds: string[];
  hubNodeIds: string[];
  localTieMemberIds: string[];
}

export interface CandidateTruss {
  schemaVersion: "1.0.0";
  sourceFingerprint: NormalizedStructuralDesign["sourceFingerprint"];
  policy: CandidateTrussPolicy;
  anchors: NormalizedStructuralAnchor[];
  brackets: CandidateTrussBracket[];
  nodes: CandidateTrussNode[];
  members: CandidateTrussMember[];
  panelAttachments: CandidatePanelAttachment[];
  rejectedMembers: RejectedCandidateMember[];
  validation: {
    connectivity: "passed";
    redundantPaths: "passed";
    pcbEnvelopeCollisions: "passed";
  };
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function add(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: StructuralVector, amount: number): StructuralVector {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function dot(left: StructuralVector, right: StructuralVector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function distance(left: StructuralVector, right: StructuralVector): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function canonicalEdgeId(
  prefix: "tie" | "inter",
  leftNodeId: string,
  rightNodeId: string,
): string {
  const [start, end] = [leftNodeId, rightNodeId].sort(compareText);
  return `${prefix}:${start}--${end}`;
}

function panelCoordinates(
  point: StructuralVector,
  panel: NormalizedStructuralPanel,
): StructuralVector {
  const offset = subtract(point, panel.centerMm);
  return [
    dot(offset, panel.xAxis),
    dot(offset, panel.yAxis),
    dot(offset, panel.outwardNormal),
  ];
}

/** Tests a closed segment against the PCB oriented box plus clearance. */
export function segmentIntersectsPanelEnvelope(
  startMm: StructuralVector,
  endMm: StructuralVector,
  panel: NormalizedStructuralPanel,
  clearanceMm: number,
): boolean {
  const start = panelCoordinates(startMm, panel);
  const end = panelCoordinates(endMm, panel);
  const halfExtents: StructuralVector = [
    panel.dimensionsMm.width / 2 + clearanceMm,
    panel.dimensionsMm.height / 2 + clearanceMm,
    panel.dimensionsMm.thickness / 2 + clearanceMm,
  ];
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = start[axis]!;
    const direction = end[axis]! - origin;
    const extent = halfExtents[axis]!;
    if (Math.abs(direction) <= 1e-12) {
      if (origin < -extent || origin > extent) return false;
      continue;
    }
    const first = (-extent - origin) / direction;
    const second = (extent - origin) / direction;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return false;
  }
  return true;
}

function attachmentHasArea(anchors: NormalizedStructuralAnchor[]): boolean {
  for (let first = 0; first < anchors.length - 2; first += 1) {
    for (let second = first + 1; second < anchors.length - 1; second += 1) {
      for (let third = second + 1; third < anchors.length; third += 1) {
        const a = anchors[first]!.localPositionMm;
        const b = anchors[second]!.localPositionMm;
        const c = anchors[third]!.localPositionMm;
        const twiceArea = Math.abs(
          (b[0] - a[0]) * (c[1] - a[1]) -
          (b[1] - a[1]) * (c[0] - a[0]),
        );
        if (twiceArea > 1e-6) return true;
      }
    }
  }
  return false;
}

function graphDiagnostics(
  nodeIds: string[],
  members: CandidateTrussMember[],
): { visited: Set<string>; bridges: string[] } {
  const adjacency = new Map(nodeIds.map((id) => [id, [] as Array<{ nodeId: string; memberId: string }>]));
  for (const member of members) {
    adjacency.get(member.startNodeId)?.push({ nodeId: member.endNodeId, memberId: member.id });
    adjacency.get(member.endNodeId)?.push({ nodeId: member.startNodeId, memberId: member.id });
  }
  for (const edges of adjacency.values()) {
    edges.sort((left, right) => compareText(left.memberId, right.memberId));
  }
  const visited = new Set<string>();
  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges: string[] = [];
  let time = 0;
  const visit = (nodeId: string, parentMemberId: string | null): void => {
    visited.add(nodeId);
    discovery.set(nodeId, time);
    low.set(nodeId, time);
    time += 1;
    for (const edge of adjacency.get(nodeId) ?? []) {
      if (edge.memberId === parentMemberId) continue;
      if (!visited.has(edge.nodeId)) {
        visit(edge.nodeId, edge.memberId);
        low.set(nodeId, Math.min(low.get(nodeId)!, low.get(edge.nodeId)!));
        if (low.get(edge.nodeId)! > discovery.get(nodeId)!) bridges.push(edge.memberId);
      } else {
        low.set(nodeId, Math.min(low.get(nodeId)!, discovery.get(edge.nodeId)!));
      }
    }
  };
  if (nodeIds[0] !== undefined) visit(nodeIds[0], null);
  return { visited, bridges: bridges.sort(compareText) };
}

export function validateCandidateTruss(candidate: CandidateTruss): void {
  const nodeById = new Map<string, CandidateTrussNode>();
  for (const node of candidate.nodes) {
    if (nodeById.has(node.id)) throw new Error(`Candidate truss node id ${node.id} is duplicated.`);
    nodeById.set(node.id, node);
  }
  const memberIds = new Set<string>();
  const endpointPairs = new Set<string>();
  for (const member of candidate.members) {
    if (memberIds.has(member.id)) throw new Error(`Candidate truss member id ${member.id} is duplicated.`);
    memberIds.add(member.id);
    const start = nodeById.get(member.startNodeId);
    const end = nodeById.get(member.endNodeId);
    if (!start || !end) throw new Error(`Candidate truss member ${member.id} references an unknown node.`);
    const pair = [start.id, end.id].sort(compareText).join("\u0000");
    if (endpointPairs.has(pair)) throw new Error(`Candidate truss edge ${start.id}--${end.id} is duplicated.`);
    endpointPairs.add(pair);
    const measuredLength = distance(start.positionMm, end.positionMm);
    if (measuredLength < candidate.policy.minimumNodeSeparationMm) {
      throw new Error(`Candidate truss member ${member.id} has zero or near-zero length.`);
    }
    if (Math.abs(measuredLength - member.lengthMm) > 1e-6) {
      throw new Error(`Candidate truss member ${member.id} has an inconsistent length.`);
    }
  }
  const anchorById = new Map<string, NormalizedStructuralAnchor>();
  for (const anchor of candidate.anchors) {
    if (anchorById.has(anchor.id)) throw new Error(`Candidate anchor id ${anchor.id} is duplicated.`);
    anchorById.set(anchor.id, anchor);
  }
  const bracketIds = new Set<string>();
  const bracketAnchorIds = new Set<string>();
  for (const bracket of candidate.brackets) {
    if (bracketIds.has(bracket.id)) throw new Error(`Candidate bracket id ${bracket.id} is duplicated.`);
    bracketIds.add(bracket.id);
    const anchor = anchorById.get(bracket.anchorId);
    const hub = nodeById.get(bracket.hubNodeId);
    if (!anchor || !hub) {
      throw new Error(`Candidate bracket ${bracket.id} references an unknown anchor or hub.`);
    }
    if (
      hub.anchorId !== bracket.anchorId || hub.panelId !== bracket.panelId ||
      distance(anchor.positionMm, bracket.anchorPositionMm) > 1e-6 ||
      distance(hub.positionMm, bracket.hubPositionMm) > 1e-6 ||
      distance(bracket.anchorPositionMm, bracket.hubPositionMm) <
        candidate.policy.minimumNodeSeparationMm ||
      Math.abs(distance(bracket.anchorPositionMm, bracket.hubPositionMm) - bracket.lengthMm) > 1e-6
    ) {
      throw new Error(`Candidate bracket ${bracket.id} has inconsistent attachment geometry.`);
    }
    if (bracketAnchorIds.has(bracket.anchorId)) {
      throw new Error(`Candidate anchor ${bracket.anchorId} has more than one bracket.`);
    }
    bracketAnchorIds.add(bracket.anchorId);
  }
  const missingBracket = candidate.anchors.find((anchor) => !bracketAnchorIds.has(anchor.id));
  if (missingBracket) throw new Error(`Candidate anchor ${missingBracket.id} has no screw bracket.`);
  const diagnostics = graphDiagnostics(candidate.nodes.map(({ id }) => id), candidate.members);
  if (diagnostics.visited.size !== candidate.nodes.length) {
    const isolated = candidate.nodes.find(({ id }) => !diagnostics.visited.has(id));
    throw new Error(`Candidate truss is disconnected at panel ${isolated?.panelId ?? "unknown"}.`);
  }
  if (diagnostics.bridges.length > 0) {
    throw new Error(
      `Candidate truss has no redundant path around member ${diagnostics.bridges[0]}.`,
    );
  }
}

export function createCandidateTruss(
  normalized: NormalizedStructuralDesign,
): CandidateTruss {
  const clearanceMm = Math.max(
    0.5,
    ...normalized.anchors.map(({ surfaceFlushCorrectionMm }) => surfaceFlushCorrectionMm),
  );
  const policy: CandidateTrussPolicy = {
    schemaVersion: "1.0.0",
    maximumCandidateMemberLengthMm:
      normalized.design.fabrication.maximumUnsupportedCompressionLengthMm * 2,
    minimumNodeSeparationMm: 0.1,
    pcbEnvelopeClearanceMm: clearanceMm,
    requiredInterPanelPaths: 2,
  };
  const panels = [...normalized.panels].sort((left, right) => compareText(left.id, right.id));
  const anchors = normalized.anchors
    .map((anchor) => structuredClone(anchor))
    .sort((left, right) => compareText(left.id, right.id));
  const anchorByPanel = new Map<string, NormalizedStructuralAnchor[]>();
  for (const anchor of anchors) {
    const panelAnchors = anchorByPanel.get(anchor.panelId) ?? [];
    panelAnchors.push(anchor);
    anchorByPanel.set(anchor.panelId, panelAnchors);
  }
  const nodes: CandidateTrussNode[] = [];
  const brackets: CandidateTrussBracket[] = [];
  const panelAttachments: CandidatePanelAttachment[] = [];
  for (const panel of panels) {
    const panelAnchors = (anchorByPanel.get(panel.id) ?? []).sort((left, right) => compareText(left.id, right.id));
    if (panelAnchors.length < 3 || !attachmentHasArea(panelAnchors)) {
      throw new Error(
        `Panel ${panel.id} cannot form a structural attachment: at least three non-collinear eligible holes are required.`,
      );
    }
    const hubNodes = panelAnchors.map((anchor): CandidateTrussNode => ({
      id: `hub:${anchor.id}`,
      kind: "anchor-hub",
      panelId: panel.id,
      anchorId: anchor.id,
      positionMm: add(
        anchor.positionMm,
        scale(anchor.outwardNormal, -normalized.design.fabrication.bracketOffsetMm),
      ),
    }));
    for (const hub of hubNodes) {
      if (segmentIntersectsPanelEnvelope(hub.positionMm, hub.positionMm, panel, clearanceMm)) {
        throw new Error(
          `Panel ${panel.id} bracket offset does not place hub ${hub.id} outside the PCB envelope.`,
        );
      }
      nodes.push(hub);
      const anchor = panelAnchors.find(({ id }) => id === hub.anchorId)!;
      brackets.push({
        id: `bracket:${anchor.id}`,
        panelId: panel.id,
        anchorId: anchor.id,
        hubNodeId: hub.id,
        anchorPositionMm: [...anchor.positionMm],
        hubPositionMm: [...hub.positionMm],
        lengthMm: distance(anchor.positionMm, hub.positionMm),
      });
    }
    panelAttachments.push({
      panelId: panel.id,
      anchorIds: panelAnchors.map(({ id }) => id),
      bracketIds: panelAnchors.map(({ id }) => `bracket:${id}`),
      hubNodeIds: hubNodes.map(({ id }) => id),
      localTieMemberIds: [],
    });
  }
  nodes.sort((left, right) => compareText(left.id, right.id));
  brackets.sort((left, right) => compareText(left.id, right.id));

  for (let left = 0; left < nodes.length - 1; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const first = nodes[left]!;
      const second = nodes[right]!;
      if (
        first.panelId !== second.panelId &&
        distance(first.positionMm, second.positionMm) < policy.minimumNodeSeparationMm
      ) {
        throw new Error(
          `Panels ${first.panelId} and ${second.panelId} create coincident structural hubs ${first.id} and ${second.id}.`,
        );
      }
    }
  }

  const members: CandidateTrussMember[] = [];
  for (const attachment of panelAttachments) {
    for (let left = 0; left < attachment.hubNodeIds.length - 1; left += 1) {
      for (let right = left + 1; right < attachment.hubNodeIds.length; right += 1) {
        const start = nodes.find(({ id }) => id === attachment.hubNodeIds[left])!;
        const end = nodes.find(({ id }) => id === attachment.hubNodeIds[right])!;
        const id = canonicalEdgeId("tie", start.id, end.id);
        const blockingPanel = panels.find((panel) =>
          panel.id !== attachment.panelId &&
          segmentIntersectsPanelEnvelope(start.positionMm, end.positionMm, panel, clearanceMm)
        );
        if (blockingPanel) {
          throw new Error(
            `Panel ${attachment.panelId} attachment member ${id} intersects PCB envelope ${blockingPanel.id}.`,
          );
        }
        members.push({
          id,
          kind: "panel-tie",
          startNodeId: start.id,
          endNodeId: end.id,
          lengthMm: distance(start.positionMm, end.positionMm),
          initialDiameterMm: normalized.design.fabrication.minimumMemberDiameterMm,
        });
        attachment.localTieMemberIds.push(id);
      }
    }
  }

  const rejectedMembers: RejectedCandidateMember[] = [];
  for (let left = 0; left < nodes.length - 1; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const start = nodes[left]!;
      const end = nodes[right]!;
      if (start.panelId === end.panelId) continue;
      const id = canonicalEdgeId("inter", start.id, end.id);
      const lengthMm = distance(start.positionMm, end.positionMm);
      if (lengthMm > policy.maximumCandidateMemberLengthMm) {
        rejectedMembers.push({
          id, startNodeId: start.id, endNodeId: end.id, lengthMm,
          reason: "member-too-long",
        });
        continue;
      }
      const blockingPanel = panels.find((panel) =>
        segmentIntersectsPanelEnvelope(start.positionMm, end.positionMm, panel, clearanceMm)
      );
      if (blockingPanel) {
        rejectedMembers.push({
          id, startNodeId: start.id, endNodeId: end.id, lengthMm,
          reason: "pcb-envelope-collision", blockingPanelId: blockingPanel.id,
        });
        continue;
      }
      members.push({
        id,
        kind: "inter-panel",
        startNodeId: start.id,
        endNodeId: end.id,
        lengthMm,
        initialDiameterMm: normalized.design.fabrication.minimumMemberDiameterMm,
      });
    }
  }
  members.sort((left, right) => compareText(left.id, right.id));
  rejectedMembers.sort((left, right) => compareText(left.id, right.id));
  panelAttachments.sort((left, right) => compareText(left.panelId, right.panelId));
  const candidate: CandidateTruss = {
    schemaVersion: "1.0.0",
    sourceFingerprint: { ...normalized.sourceFingerprint },
    policy,
    anchors,
    brackets,
    nodes,
    members,
    panelAttachments,
    rejectedMembers,
    validation: {
      connectivity: "passed",
      redundantPaths: "passed",
      pcbEnvelopeCollisions: "passed",
    },
  };
  try {
    validateCandidateTruss(candidate);
  } catch (error) {
    const collisionCount = rejectedMembers.filter(
      ({ reason }) => reason === "pcb-envelope-collision",
    ).length;
    const longMemberCount = rejectedMembers.filter(
      ({ reason }) => reason === "member-too-long",
    ).length;
    if (
      error instanceof Error &&
      (error.message.includes("disconnected") || error.message.includes("no redundant path"))
    ) {
      throw new Error(
        `${error.message} Candidate filtering rejected ${collisionCount} PCB-envelope ` +
        `collision${collisionCount === 1 ? "" : "s"} and ${longMemberCount} over-length ` +
        `member${longMemberCount === 1 ? "" : "s"}.`,
      );
    }
    throw error;
  }
  return candidate;
}
