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
import { compileStructuralTrussModel } from "../src/structure/TrussSolver.ts";

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
  it("starts a screw bracket at every anchor used by a local connector", async () => {
    const input = await normalized();
    const candidate = createCandidateTruss(input);

    expect(candidate.anchors).toHaveLength(4);
    expect(candidate.brackets).toHaveLength(4);
    expect(candidate.nodes).toHaveLength(8);
    expect(candidate.connectorCells).toHaveLength(1);
    expect(candidate.connectorCells[0]).toMatchObject({
      id: "connector:P-01--P-02",
      panelIds: ["P-01", "P-02"],
      source: "automatic",
    });
    expect(candidate.connectorCells[0]!.panelAnchorIds.map((ids) => ids.length))
      .toEqual([2, 2]);
    expect(candidate.connectorCells[0]!.sideNodeIds.map((ids) => ids.length))
      .toEqual([3, 3]);
    expect(candidate.members.filter(({ kind }) => kind === "panel-tie")).toHaveLength(12);
    expect(candidate.members.filter(({ kind }) => kind === "inter-panel")).toHaveLength(9);
    expect(candidate.anchors.some(({ holeId }) =>
      holeId === "bottom-left" || holeId === "top-right"
    )).toBe(false);
    expect(candidate.brackets.find(({ id }) => id === "bracket:P-01:bottom-right"))
      .toMatchObject({
        panelId: "P-01",
        anchorId: "P-01:bottom-right",
        hubNodeId: "hub:P-01:bottom-right",
        anchorPositionMm: [25, 50, 24.5],
        hubPositionMm: [25, 42, 24.5],
        lengthMm: 8,
      });
    expect(candidate.validation).toEqual({
      connectivity: "passed",
      redundantPaths: "passed",
      pcbEnvelopeCollisions: "passed",
    });
    const model = compileStructuralTrussModel(input, candidate);
    expect(model.supports.map(({ nodeId }) => nodeId)).toEqual(
      candidate.nodes.filter(({ panelId }) => panelId === "P-01")
        .map(({ id }) => id).sort(),
    );
  });

  it("limits each panel-pair connector to its reserved holes in the existing arbitrary-pose 41-panel project", async () => {
    const candidate = createCandidateTruss(await normalizedProject(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    ));

    expect(candidate.panelAttachments).toHaveLength(41);
    expect(candidate.anchors.length).toBeLessThanOrEqual(160);
    expect(candidate.brackets).toHaveLength(candidate.anchors.length);
    expect(candidate.validation.redundantPaths).toBe("passed");
    expect(candidate.connectorCells).toHaveLength(40);
    expect(new Set(candidate.connectorCells.flatMap(({ junctionId }) =>
      junctionId ? [junctionId] : []
    )).size).toBe(3);
    expect(Math.max(...candidate.panelAttachments.map((attachment) =>
      candidate.connectorCells.filter((cell) => cell.panelIds.includes(attachment.panelId)).length
    ))).toBeLessThanOrEqual(2);
  });

  it("reserves the nearest unused eligible screw holes toward each neighboring panel", async () => {
    const input = await normalizedProject(
      "sculptures/structural-three-panel-trail/sculpture.json",
    );
    const candidate = createCandidateTruss(input);
    const used = new Set<string>();
    for (const cell of candidate.connectorCells) {
      for (const sideIndex of [0, 1] as const) {
        const panelId = cell.panelIds[sideIndex];
        const neighbor = input.panels.find(({ id }) => id === cell.panelIds[1 - sideIndex])!;
        const count = cell.panelAnchorIds[sideIndex].length;
        const expected = input.anchors.filter((anchor) =>
          anchor.panelId === panelId && !used.has(anchor.id)
        ).sort((left, right) =>
          Math.hypot(...left.positionMm.map((value, axis) =>
            value - neighbor.centerMm[axis]!
          )) - Math.hypot(...right.positionMm.map((value, axis) =>
            value - neighbor.centerMm[axis]!
          )) || left.id.localeCompare(right.id)
        ).slice(0, count).map(({ id }) => id).sort();
        expect(cell.panelAnchorIds[sideIndex]).toEqual(expected);
        for (const id of expected) used.add(id);
      }
    }
  });

  it("shares screw shoes only inside one spatially local three-panel junction", async () => {
    const junction = createCandidateTruss(await normalizedProject(
      "sculptures/structural-three-panel-junction/sculpture.json",
    ));
    const junctionIds = new Set(junction.connectorCells.map(({ junctionId }) => junctionId));
    expect(junction.connectorCells).toHaveLength(2);
    expect(junctionIds).toEqual(new Set(["junction:P-01--P-02--P-03"]));
    const sharedPanelAnchors = junction.connectorCells.map((cell) => {
      const sideIndex = cell.panelIds.indexOf("P-02");
      return cell.panelAnchorIds[sideIndex]!.slice().sort();
    });
    expect(sharedPanelAnchors[0]).toEqual(sharedPanelAnchors[1]);

    const trail = createCandidateTruss(await normalizedProject(
      "sculptures/structural-three-panel-trail/sculpture.json",
    ));
    expect(trail.connectorCells).toHaveLength(2);
    expect(trail.connectorCells.every(({ junctionId }) => junctionId === undefined)).toBe(true);
    expect(new Set(trail.connectorCells.flatMap(({ panelAnchorIds }) => panelAnchorIds.flat())).size)
      .toBe(trail.connectorCells.reduce(
        (count, { panelAnchorIds }) => count + panelAnchorIds.flat().length,
        0,
      ));
  });

  it("is independent of panel, anchor, and hole storage order", async () => {
    const first = await normalized();
    const reordered = structuredClone(first);
    reordered.panels.reverse();
    reordered.anchors.reverse();
    for (const panel of reordered.panels) panel.anchorIds.reverse();

    expect(createCandidateTruss(reordered)).toEqual(createCandidateTruss(first));

    const junction = await normalizedProject(
      "sculptures/structural-three-panel-junction/sculpture.json",
    );
    const reorderedJunction = structuredClone(junction);
    reorderedJunction.panels.reverse();
    reorderedJunction.anchors.reverse();
    for (const panel of reorderedJunction.panels) panel.anchorIds.reverse();
    expect(createCandidateTruss(reorderedJunction)).toEqual(createCandidateTruss(junction));
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
      /no redundant local load path/,
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
    expect(() => createCandidateTruss(disconnected)).toThrow(/cannot connect panel P-02/);
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
    expect(() => validateCandidateTruss(isolated)).toThrow(
      /invalid member|invalid bracket tie|disconnected at panel/,
    );

    const movedBracket = createCandidateTruss(await normalized());
    movedBracket.brackets[0]!.anchorPositionMm[0] += 10;
    movedBracket.brackets[0]!.hubPositionMm[0] += 10;
    expect(() => validateCandidateTruss(movedBracket)).toThrow(
      /inconsistent attachment geometry/,
    );
  });

  it("forms a local panel-pair trail instead of an all-to-all sculpture truss", async () => {
    const input = await normalized();
    const templatePanel = input.panels.find(({ id }) => id === "P-01")!;
    const templateAnchors = input.anchors.filter(({ panelId }) => panelId === "P-01");
    input.panels = [0, 1, 2].map((index) => {
      const panel = structuredClone(templatePanel);
      panel.id = `P-0${index + 1}`;
      panel.centerMm[0] += index * 80;
      for (const corner of Object.values(panel.corners)) corner[0] += index * 80;
      panel.anchorIds = templateAnchors.map(({ id }) =>
        id.replace("P-01:", `${panel.id}:`)
      );
      return panel;
    });
    input.anchors = input.panels.flatMap((panel, index) =>
      templateAnchors.map((anchor) => {
        const copy = structuredClone(anchor);
        copy.id = copy.id.replace("P-01:", `${panel.id}:`);
        copy.panelId = panel.id;
        copy.positionMm[0] += index * 80;
        return copy;
      })
    );

    const candidate = createCandidateTruss(input);
    expect(candidate.connectorCells.map(({ panelIds }) => panelIds)).toEqual([
      ["P-01", "P-02"],
      ["P-02", "P-03"],
    ]);
    expect(candidate.connectorCells.some(({ panelIds }) =>
      panelIds[0] === "P-01" && panelIds[1] === "P-03"
    )).toBe(false);
  });
});
