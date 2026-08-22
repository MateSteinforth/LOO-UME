import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  normalizeStructuralDesign,
  type NormalizedStructuralDesign,
} from "../src/sculpture/StructuralDesign.ts";
import {
  createCandidateTruss,
  segmentIntersectsPanelEnvelope,
  validateCandidateTruss,
} from "../src/structure/CandidateTruss.ts";

async function definition(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-two-panel/sculpture.json",
    "utf8",
  )));
}

async function normalized(): Promise<NormalizedStructuralDesign> {
  const source = await definition();
  return normalizeStructuralDesign(createPanelAssemblyProject(
    source,
    "sculptures/pose-only-two-panel/sculpture.json",
  ));
}

async function normalizedProject(path: string): Promise<NormalizedStructuralDesign> {
  const source = parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
  return normalizeStructuralDesign(createPanelAssemblyProject(source, path));
}

describe("deterministic candidate truss", () => {
  it("starts one screw bracket at every eligible hole and creates redundant paths", async () => {
    const candidate = createCandidateTruss(await normalized());

    expect(candidate.anchors).toHaveLength(8);
    expect(candidate.brackets).toHaveLength(8);
    expect(candidate.nodes).toHaveLength(8);
    expect(candidate.members.filter(({ kind }) => kind === "panel-tie")).toHaveLength(12);
    expect(candidate.members.filter(({ kind }) => kind === "inter-panel")).toHaveLength(16);
    expect(candidate.anchors.some(({ holeId }) =>
      holeId === "bottom-left" || holeId === "top-right"
    )).toBe(false);
    expect(candidate.brackets.find(({ id }) => id === "bracket:P-01:top-left"))
      .toMatchObject({
        panelId: "P-01",
        anchorId: "P-01:top-left",
        hubNodeId: "hub:P-01:top-left",
        anchorPositionMm: [-25, 50, -24.5],
        hubPositionMm: [-25, 42, -24.5],
        lengthMm: 8,
      });
    expect(candidate.validation).toEqual({
      connectivity: "passed",
      redundantPaths: "passed",
      pcbEnvelopeCollisions: "passed",
    });
  });

  it("connects every eligible hole in the existing arbitrary-pose 41-panel project", async () => {
    const candidate = createCandidateTruss(await normalizedProject(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    ));

    expect(candidate.panelAttachments).toHaveLength(41);
    expect(candidate.anchors).toHaveLength(164);
    expect(candidate.brackets).toHaveLength(candidate.anchors.length);
    expect(candidate.validation.redundantPaths).toBe("passed");
  });

  it("is independent of panel, anchor, and hole storage order", async () => {
    const first = await normalized();
    const reordered = structuredClone(first);
    reordered.panels.reverse();
    reordered.anchors.reverse();
    for (const panel of reordered.panels) panel.anchorIds.reverse();

    expect(createCandidateTruss(reordered)).toEqual(createCandidateTruss(first));
  });

  it("detects PCB-envelope collisions in panel-local coordinates", async () => {
    const input = await normalized();
    const panel = input.panels[0]!;

    expect(segmentIntersectsPanelEnvelope(
      [-100, 50, 0],
      [100, 50, 0],
      panel,
      0.5,
    )).toBe(true);
    expect(segmentIntersectsPanelEnvelope(
      [-100, 40, 0],
      [100, 40, 0],
      panel,
      0.5,
    )).toBe(false);
  });

  it("reports when PCB collisions prevent an inter-panel load path", async () => {
    const input = await normalized();
    const panel = input.panels.find(({ id }) => id === "P-01")!;
    panel.yAxis = [0, 0, 1];
    panel.outwardNormal = [0, -1, 0];
    for (const anchor of input.anchors.filter(({ panelId }) => panelId === panel.id)) {
      anchor.positionMm = [anchor.localPositionMm[0], 50, anchor.localPositionMm[1]];
      anchor.outwardNormal = [0, -1, 0];
    }

    expect(() => createCandidateTruss(input)).toThrow(
      /disconnected.*rejected 16 PCB-envelope collisions/,
    );
  });

  it("rejects coincident hubs and disconnected panel groups", async () => {
    const coincident = await normalized();
    const firstPanel = coincident.panels[0]!;
    const secondPanel = coincident.panels[1]!;
    secondPanel.centerMm = [...firstPanel.centerMm];
    secondPanel.xAxis = [...firstPanel.xAxis];
    secondPanel.yAxis = [...firstPanel.yAxis];
    secondPanel.outwardNormal = [...firstPanel.outwardNormal];
    const firstAnchors = coincident.anchors.filter(({ panelId }) => panelId === firstPanel.id);
    const secondAnchors = coincident.anchors.filter(({ panelId }) => panelId === secondPanel.id);
    for (const anchor of secondAnchors) {
      const matching = firstAnchors.find(({ holeId }) => holeId === anchor.holeId)!;
      anchor.positionMm = [...matching.positionMm];
      anchor.outwardNormal = [...matching.outwardNormal];
    }
    expect(() => createCandidateTruss(coincident)).toThrow(/coincident structural hubs/);

    const disconnected = await normalized();
    const remotePanel = disconnected.panels[1]!;
    remotePanel.centerMm[0] += 1000;
    for (const anchor of disconnected.anchors.filter(({ panelId }) => panelId === remotePanel.id)) {
      anchor.positionMm[0] += 1000;
    }
    expect(() => createCandidateTruss(disconnected)).toThrow(/disconnected at panel P-02/);
  });

  it("rejects attachments without three non-collinear eligible holes", async () => {
    const input = await normalized();
    input.anchors = input.anchors.filter(
      ({ panelId, holeId }) => panelId !== "P-01" || holeId.endsWith("-left"),
    );
    expect(() => createCandidateTruss(input)).toThrow(
      /Panel P-01 cannot form a structural attachment/,
    );
  });

  it("rejects duplicate, zero-length, and isolated graph mutations", async () => {
    const duplicate = createCandidateTruss(await normalized());
    duplicate.members.push({ ...duplicate.members[0]!, id: "duplicate-edge" });
    expect(() => validateCandidateTruss(duplicate)).toThrow(/edge .* is duplicated/);

    const zeroLength = createCandidateTruss(await normalized());
    const member = zeroLength.members[0]!;
    zeroLength.nodes.find(({ id }) => id === member.endNodeId)!.positionMm = [
      ...zeroLength.nodes.find(({ id }) => id === member.startNodeId)!.positionMm,
    ];
    expect(() => validateCandidateTruss(zeroLength)).toThrow(/zero or near-zero length/);

    const isolated = createCandidateTruss(await normalized());
    const isolatedNodeId = isolated.nodes[0]!.id;
    isolated.members = isolated.members.filter(
      ({ startNodeId, endNodeId }) =>
        startNodeId !== isolatedNodeId && endNodeId !== isolatedNodeId,
    );
    expect(() => validateCandidateTruss(isolated)).toThrow(/disconnected at panel/);

    const movedBracket = createCandidateTruss(await normalized());
    movedBracket.brackets[0]!.anchorPositionMm[0] += 10;
    movedBracket.brackets[0]!.hubPositionMm[0] += 10;
    expect(() => validateCandidateTruss(movedBracket)).toThrow(
      /inconsistent attachment geometry/,
    );
  });
});
