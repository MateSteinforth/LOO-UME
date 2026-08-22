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
  requiredInterPanelPaths: 3;
  maximumAutomaticNeighborsPerPanel: number;
  minimumAnchorsPerPanelSide: number;
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
  kind: "anchor-hub" | "panel-rigidity" | "connector-hub";
  panelId: string;
  anchorId?: string;
  positionMm: StructuralVector;
}

export interface CandidateTrussMember {
  id: string;
  kind: "panel-tie" | "inter-panel";
  startNodeId: string;
  endNodeId: string;
  lengthMm: number;
  initialDiameterMm: number;
  connectorCellId?: string;
  analysisOnly?: boolean;
}

export interface CandidateConnectorCell {
  id: string;
  panelIds: [string, string];
  panelAnchorIds: [string[], string[]];
  sideNodeIds: [string[], string[]];
  bracketTieMemberIds: [string[], string[]];
  memberIds: string[];
  source: "automatic" | "authored-include";
  panelDistanceMm: number;
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
  rigidityNodeId: string;
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
  connectorCells: CandidateConnectorCell[];
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

function panelPairId(leftPanelId: string, rightPanelId: string): string {
  return [leftPanelId, rightPanelId].sort(compareText).join("--");
}

interface PanelPairCandidate {
  id: string;
  panelIds: [string, string];
  distanceMm: number;
  source: "automatic" | "authored-include";
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    const first = this.find(left);
    const second = this.find(right);
    if (first !== second) this.parent.set(second, first);
  }
}

function selectPanelPairs(
  normalized: NormalizedStructuralDesign,
  panels: NormalizedStructuralPanel[],
  nodes: CandidateTrussNode[],
): PanelPairCandidate[] {
  if (panels.length < 2) return [];
  const nodeByPanel = new Map<string, CandidateTrussNode[]>();
  for (const node of nodes) {
    const values = nodeByPanel.get(node.panelId) ?? [];
    values.push(node);
    nodeByPanel.set(node.panelId, values);
  }
  const overrides = new Map(
    normalized.connectorization.panelPairOverrides.map((override) => [
      panelPairId(...override.panelIds),
      override.action,
    ]),
  );
  const allPairs: PanelPairCandidate[] = [];
  for (let left = 0; left < panels.length - 1; left += 1) {
    for (let right = left + 1; right < panels.length; right += 1) {
      const first = panels[left]!;
      const second = panels[right]!;
      const id = panelPairId(first.id, second.id);
      const distanceMm = Math.min(...(nodeByPanel.get(first.id) ?? []).flatMap((start) =>
        (nodeByPanel.get(second.id) ?? []).map((end) =>
          distance(start.positionMm, end.positionMm)
        )
      ));
      const override = overrides.get(id);
      if (override === "exclude") continue;
      if (
        override !== "include" &&
        distanceMm > normalized.connectorization.maximumNeighborDistanceMm
      ) continue;
      allPairs.push({
        id,
        panelIds: [first.id, second.id],
        distanceMm,
        source: override === "include" ? "authored-include" : "automatic",
      });
    }
  }
  allPairs.sort((left, right) =>
    left.distanceMm - right.distanceMm || compareText(left.id, right.id)
  );
  const distanceByPair = new Map(allPairs.map((pair) => [pair.id, pair.distanceMm]));
  const selected = new Map<string, PanelPairCandidate>();
  const degree = new Map(panels.map((panel) => [panel.id, 0]));
  const components = new DisjointSet(panels.map(({ id }) => id));
  const addPair = (pair: PanelPairCandidate): boolean => {
    if (selected.has(pair.id)) return true;
    if (
      pair.source === "automatic" &&
      ((degree.get(pair.panelIds[0]) ?? 0) >= normalized.connectorization.maximumAutomaticNeighborsPerPanel ||
        (degree.get(pair.panelIds[1]) ?? 0) >= normalized.connectorization.maximumAutomaticNeighborsPerPanel)
    ) return false;
    selected.set(pair.id, pair);
    degree.set(pair.panelIds[0], (degree.get(pair.panelIds[0]) ?? 0) + 1);
    degree.set(pair.panelIds[1], (degree.get(pair.panelIds[1]) ?? 0) + 1);
    return true;
  };
  for (const pair of allPairs.filter(({ source }) => source === "authored-include")) addPair(pair);
  for (const pair of selected.values()) components.union(...pair.panelIds);
  for (const pair of allPairs.filter(({ source }) => source === "automatic")) {
    const [firstId, secondId] = pair.panelIds;
    const relativeNeighbor = panels.every((third) => {
      if (third.id === firstId || third.id === secondId) return true;
      const firstDistance = distanceByPair.get(panelPairId(firstId, third.id));
      const secondDistance = distanceByPair.get(panelPairId(secondId, third.id));
      return firstDistance === undefined || secondDistance === undefined ||
        Math.max(firstDistance, secondDistance) >= pair.distanceMm - 1e-9;
    });
    if (
      relativeNeighbor &&
      components.find(firstId) !== components.find(secondId) &&
      addPair(pair)
    ) components.union(firstId, secondId);
  }
  for (const pair of allPairs) {
    if (components.find(pair.panelIds[0]) === components.find(pair.panelIds[1])) continue;
    if (addPair(pair)) components.union(...pair.panelIds);
  }
  const firstRoot = components.find(panels[0]!.id);
  const disconnected = panels.find(({ id }) => components.find(id) !== firstRoot);
  if (disconnected) {
    throw new Error(
      `Automatic connector neighbors cannot connect panel ${disconnected.id} within ` +
      `${normalized.connectorization.maximumNeighborDistanceMm} mm and degree ` +
      `${normalized.connectorization.maximumAutomaticNeighborsPerPanel}. Add an include override or increase the limits.`,
    );
  }
  return [...selected.values()].sort((left, right) => compareText(left.id, right.id));
}

function selectConnectorAnchors(
  pair: PanelPairCandidate,
  panelId: string,
  otherPanel: NormalizedStructuralPanel,
  anchors: NormalizedStructuralAnchor[],
  usedAnchorIds: Set<string>,
  requiredAnchorIds: Set<string>,
  count: number,
): NormalizedStructuralAnchor[] {
  const available = anchors.filter((anchor) =>
    anchor.panelId === panelId && !usedAnchorIds.has(anchor.id)
  );
  if (available.length < count) {
    throw new Error(
      `Connector ${pair.id} needs ${count} unused anchors on panel ${panelId}, but only ${available.length} remain. ` +
      `Reduce panel degree or add a different panel-pair override.`,
    );
  }
  const ranked = available.map((anchor) => ({
    anchor,
    required: requiredAnchorIds.has(anchor.id),
    score: distance(anchor.positionMm, otherPanel.centerMm),
  })).sort((left, right) =>
    Number(right.required) - Number(left.required) ||
    left.score - right.score || compareText(left.anchor.id, right.anchor.id)
  );
  const selected = ranked.slice(0, count).map(({ anchor }) => anchor);
  for (const anchor of selected) usedAnchorIds.add(anchor.id);
  return selected.sort((left, right) => compareText(left.id, right.id));
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
  const cells = new Set<string>();
  for (const cell of candidate.connectorCells) {
    if (cells.has(cell.id)) throw new Error(`Connector cell ${cell.id} is duplicated.`);
    cells.add(cell.id);
    if (cell.panelIds[0] === cell.panelIds[1]) {
      throw new Error(`Connector cell ${cell.id} must join two panels.`);
    }
    if (
      cell.panelAnchorIds.length !== 2 || cell.sideNodeIds.length !== 2 ||
      cell.bracketTieMemberIds.length !== 2
    ) {
      throw new Error(`Connector cell ${cell.id} requires two bracket sides.`);
    }
    for (const [sideIndex, side] of cell.panelAnchorIds.entries()) {
      if (new Set(side).size < candidate.policy.minimumAnchorsPerPanelSide) {
        throw new Error(`Connector cell ${cell.id} has an insufficient two-hole attachment.`);
      }
      const panelId = cell.panelIds[sideIndex]!;
      for (const anchorId of side) {
        const anchor = anchorById.get(anchorId);
        const node = [...nodeById.values()].find((candidateNode) =>
          candidateNode.anchorId === anchorId
        );
        if (!anchor || anchor.panelId !== panelId || !node ||
          !cell.sideNodeIds[sideIndex]!.includes(node.id)) {
          throw new Error(`Connector cell ${cell.id} has an invalid anchor assignment ${anchorId}.`);
        }
      }
      const connectorHubs = cell.sideNodeIds[sideIndex]!.filter((nodeId) =>
        nodeById.get(nodeId)?.kind === "connector-hub" &&
        nodeById.get(nodeId)?.panelId === panelId
      );
      if (connectorHubs.length !== 1) {
        throw new Error(`Connector cell ${cell.id} requires one offset hub on panel ${panelId}.`);
      }
      for (const tieId of cell.bracketTieMemberIds[sideIndex]!) {
        const tie = candidate.members.find(({ id }) => id === tieId);
        if (!tie || tie.kind !== "panel-tie" || tie.connectorCellId !== cell.id) {
          throw new Error(`Connector cell ${cell.id} references invalid bracket tie ${tieId}.`);
        }
      }
    }
    if (cell.memberIds.length < candidate.policy.requiredInterPanelPaths) {
      throw new Error(`Connector cell ${cell.id} has no redundant local load path.`);
    }
    const touchedNodes = new Set<string>();
    for (const memberId of cell.memberIds) {
      const member = candidate.members.find(({ id }) => id === memberId);
      if (!member || member.kind !== "inter-panel" || member.connectorCellId !== cell.id) {
        throw new Error(`Connector cell ${cell.id} references invalid member ${memberId}.`);
      }
      touchedNodes.add(member.startNodeId);
      touchedNodes.add(member.endNodeId);
    }
    for (const side of cell.sideNodeIds) {
      if (side.some((nodeId) => !touchedNodes.has(nodeId))) {
        throw new Error(`Connector cell ${cell.id} does not engage every bracket-side node.`);
      }
    }
  }
  for (const member of candidate.members.filter(({ kind }) => kind === "inter-panel")) {
    if (!member.connectorCellId || !cells.has(member.connectorCellId)) {
      throw new Error(`Inter-panel member ${member.id} has no connector cell.`);
    }
  }
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
    requiredInterPanelPaths: 3,
    maximumAutomaticNeighborsPerPanel:
      normalized.connectorization.maximumAutomaticNeighborsPerPanel,
    minimumAnchorsPerPanelSide:
      normalized.connectorization.minimumAnchorsPerPanelSide,
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
    const rigidityNode: CandidateTrussNode = {
      id: `panel-rigidity:${panel.id}`,
      kind: "panel-rigidity",
      panelId: panel.id,
      positionMm: add(
        panel.centerMm,
        scale(panel.outwardNormal, -2 * normalized.design.fabrication.bracketOffsetMm),
      ),
    };
    nodes.push(rigidityNode);
    panelAttachments.push({
      panelId: panel.id,
      anchorIds: panelAnchors.map(({ id }) => id),
      bracketIds: panelAnchors.map(({ id }) => `bracket:${id}`),
      hubNodeIds: hubNodes.map(({ id }) => id),
      rigidityNodeId: rigidityNode.id,
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
          initialDiameterMm: normalized.design.fabrication.maximumMemberDiameterMm,
          analysisOnly: true,
        });
        attachment.localTieMemberIds.push(id);
      }
    }
    const rigidityNode = nodes.find(({ id }) => id === attachment.rigidityNodeId)!;
    for (const hubNodeId of attachment.hubNodeIds) {
      const hub = nodes.find(({ id }) => id === hubNodeId)!;
      const id = canonicalEdgeId("tie", hub.id, rigidityNode.id);
      members.push({
        id,
        kind: "panel-tie",
        startNodeId: hub.id,
        endNodeId: rigidityNode.id,
        lengthMm: distance(hub.positionMm, rigidityNode.positionMm),
        initialDiameterMm: normalized.design.fabrication.maximumMemberDiameterMm,
        analysisOnly: true,
      });
      attachment.localTieMemberIds.push(id);
    }
  }

  const rejectedMembers: RejectedCandidateMember[] = [];
  const connectorCells: CandidateConnectorCell[] = [];
  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  const nodeByAnchorId = new Map(
    nodes.filter((node): node is CandidateTrussNode & { anchorId: string } =>
      node.anchorId !== undefined
    ).map((node) => [node.anchorId, node]),
  );
  const usedAnchorIds = new Set<string>();
  const requiredAnchorIds = new Set(
    normalized.supports
      .filter(({ source }) => source === "authored-anchor")
      .map(({ anchorId }) => anchorId),
  );
  for (const pair of selectPanelPairs(normalized, panels, nodes)) {
    const firstPanel = panelById.get(pair.panelIds[0])!;
    const secondPanel = panelById.get(pair.panelIds[1])!;
    const firstAnchors = selectConnectorAnchors(
      pair, firstPanel.id, secondPanel, anchors, usedAnchorIds,
      requiredAnchorIds,
      policy.minimumAnchorsPerPanelSide,
    );
    const secondAnchors = selectConnectorAnchors(
      pair, secondPanel.id, firstPanel, anchors, usedAnchorIds,
      requiredAnchorIds,
      policy.minimumAnchorsPerPanelSide,
    );
    const cellId = `connector:${pair.id}`;
    const sideAnchorNodes = [
      firstAnchors.map((anchor) => nodeByAnchorId.get(anchor.id)!),
      secondAnchors.map((anchor) => nodeByAnchorId.get(anchor.id)!),
    ] as [CandidateTrussNode[], CandidateTrussNode[]];
    const sidePanels = [firstPanel, secondPanel] as const;
    const sideNodes: [CandidateTrussNode[], CandidateTrussNode[]] = [[], []];
    const bracketTieMemberIds: [string[], string[]] = [[], []];
    for (const sideIndex of [0, 1] as const) {
      const anchorNodes = sideAnchorNodes[sideIndex];
      const panel = sidePanels[sideIndex];
      const midpoint = scale(
        add(anchorNodes[0]!.positionMm, anchorNodes[1]!.positionMm),
        0.5,
      );
      let connectorHubPosition = add(
        midpoint,
        scale(panel.outwardNormal, -normalized.design.fabrication.bracketOffsetMm),
      );
      const panelAttachment = panelAttachments.find(
        (attachment) => attachment.panelId === panel.id,
      )!;
      const rigidityNode = nodes.find(({ id }) => id === panelAttachment.rigidityNodeId)!;
      if (distance(connectorHubPosition, rigidityNode.positionMm) < policy.minimumNodeSeparationMm) {
        connectorHubPosition = add(
          connectorHubPosition,
          scale(panel.xAxis, Math.max(2, normalized.design.fabrication.minimumMemberDiameterMm)),
        );
      }
      const connectorHub: CandidateTrussNode = {
        id: `${cellId}:hub:${panel.id}`,
        kind: "connector-hub",
        panelId: panel.id,
        positionMm: connectorHubPosition,
      };
      nodes.push(connectorHub);
      sideNodes[sideIndex] = [...anchorNodes, connectorHub];
      for (const anchorNode of anchorNodes) {
        const tieId = canonicalEdgeId("tie", anchorNode.id, connectorHub.id);
        members.push({
          id: tieId,
          kind: "panel-tie",
          startNodeId: anchorNode.id,
          endNodeId: connectorHub.id,
          lengthMm: distance(anchorNode.positionMm, connectorHub.positionMm),
          initialDiameterMm: normalized.design.fabrication.minimumMemberDiameterMm,
          connectorCellId: cellId,
        });
        bracketTieMemberIds[sideIndex].push(tieId);
      }
      const rigidityTieId = canonicalEdgeId("tie", connectorHub.id, rigidityNode.id);
      members.push({
        id: rigidityTieId,
        kind: "panel-tie",
        startNodeId: connectorHub.id,
        endNodeId: rigidityNode.id,
        lengthMm: distance(connectorHub.positionMm, rigidityNode.positionMm),
        initialDiameterMm: normalized.design.fabrication.maximumMemberDiameterMm,
        connectorCellId: cellId,
        analysisOnly: true,
      });
      panelAttachment.localTieMemberIds.push(rigidityTieId);
    }
    const cellMemberIds: string[] = [];
    for (const start of sideNodes[0]) for (const end of sideNodes[1]) {
      const id = canonicalEdgeId("inter", start.id, end.id);
      const lengthMm = distance(start.positionMm, end.positionMm);
      if (
        pair.source !== "authored-include" &&
        lengthMm > policy.maximumCandidateMemberLengthMm
      ) {
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
        connectorCellId: cellId,
      });
      cellMemberIds.push(id);
    }
    connectorCells.push({
      id: cellId,
      panelIds: [...pair.panelIds],
      panelAnchorIds: [
        firstAnchors.map(({ id }) => id),
        secondAnchors.map(({ id }) => id),
      ],
      sideNodeIds: [
        sideNodes[0].map(({ id }) => id).sort(compareText),
        sideNodes[1].map(({ id }) => id).sort(compareText),
      ],
      bracketTieMemberIds: [
        bracketTieMemberIds[0].sort(compareText),
        bracketTieMemberIds[1].sort(compareText),
      ],
      memberIds: cellMemberIds.sort(compareText),
      source: pair.source,
      panelDistanceMm: pair.distanceMm,
    });
  }
  const activeAnchorIds = new Set(
    connectorCells.flatMap(({ panelAnchorIds }) => panelAnchorIds.flat()),
  );
  const missingRequiredAnchor = [...requiredAnchorIds]
    .sort(compareText)
    .find((anchorId) => !activeAnchorIds.has(anchorId));
  if (missingRequiredAnchor) {
    throw new Error(
      `Authored structural support ${missingRequiredAnchor} is not held by a printable connector. ` +
      "Include a connector that can use this anchor or reduce competing panel connections.",
    );
  }
  const inactiveNodeIds = new Set(
    nodes
      .filter(({ anchorId }) => anchorId !== undefined && !activeAnchorIds.has(anchorId))
      .map(({ id }) => id),
  );
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (inactiveNodeIds.has(nodes[index]!.id)) nodes.splice(index, 1);
  }
  for (let index = brackets.length - 1; index >= 0; index -= 1) {
    if (!activeAnchorIds.has(brackets[index]!.anchorId)) brackets.splice(index, 1);
  }
  for (let index = members.length - 1; index >= 0; index -= 1) {
    const member = members[index]!;
    if (inactiveNodeIds.has(member.startNodeId) || inactiveNodeIds.has(member.endNodeId)) {
      members.splice(index, 1);
    }
  }
  for (const attachment of panelAttachments) {
    attachment.anchorIds = attachment.anchorIds.filter((id) => activeAnchorIds.has(id));
    attachment.bracketIds = attachment.bracketIds.filter((id) =>
      brackets.some((bracket) => bracket.id === id)
    );
    attachment.hubNodeIds = attachment.hubNodeIds.filter((id) => !inactiveNodeIds.has(id));
    attachment.localTieMemberIds = attachment.localTieMemberIds.filter((id) =>
      members.some((member) => member.id === id)
    );
  }
  nodes.sort((left, right) => compareText(left.id, right.id));
  members.sort((left, right) => compareText(left.id, right.id));
  rejectedMembers.sort((left, right) => compareText(left.id, right.id));
  panelAttachments.sort((left, right) => compareText(left.panelId, right.panelId));
  const candidate: CandidateTruss = {
    schemaVersion: "1.0.0",
    sourceFingerprint: { ...normalized.sourceFingerprint },
    policy,
    anchors: anchors.filter(({ id }) => activeAnchorIds.has(id)),
    brackets,
    nodes,
    members,
    panelAttachments,
    connectorCells: connectorCells.sort((left, right) => compareText(left.id, right.id)),
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
