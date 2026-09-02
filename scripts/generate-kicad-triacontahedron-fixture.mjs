import { readFile, writeFile } from "node:fs/promises";
import { optimizeAutomaticWiring } from "../src/sculpture/AutomaticWiringOptimizer.ts";
import { parsePanelHardwareProfile } from "../src/sculpture/Definition.ts";

const PROFILE_SOURCE = "sculptures/kicad-diamond-panel/panel-profile.json";
const SINGLE_SOURCE = "sculptures/kicad-diamond-panel/sculpture.json";
const SCULPTURE_SOURCE =
  "sculptures/kicad-diamond-panel/sculpture-rhombic-triacontahedron.json";
const PHI = (1 + Math.sqrt(5)) / 2;
const EDGE_MM = 100;
const SHORT_HALF_MM = EDGE_MM / Math.sqrt(PHI * PHI + 1);
const LONG_HALF_MM = PHI * SHORT_HALF_MM;
const CORNER_CLIP_MM = 4;
const CLIP_X_MM = LONG_HALF_MM * (1 - CORNER_CLIP_MM / EDGE_MM);
const CLIP_Y_MM = SHORT_HALF_MM * CORNER_CLIP_MM / EDGE_MM;
const INRADIUS_MM = SHORT_HALF_MM * PHI * PHI;
const EPSILON = 1e-8;
const IMAGE_APERTURES = [
  ["mount-top", 0, 42],
  ["mount-upper-left", -34.5, 21],
  ["mount-upper-right", 34.5, 21],
  ["mount-left", -69, 0],
  ["mount-center", 0, 0],
  ["mount-right", 69, 0],
  ["mount-lower-left", -34.5, -21],
  ["mount-lower-right", 34.5, -21],
  ["mount-bottom", 0, -42],
];
const COMPATIBILITY_HOLES = {
  "top-left": [0, 42],
  "middle-left": [-34.5, 21],
  "bottom-left": [0, -42],
  "top-right": [34.5, 21],
  "middle-right": [-34.5, -21],
  "bottom-right": [34.5, -21],
};

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function scale(vector, amount) {
  return vector.map((value) => value * amount);
}

function length(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  return scale(vector, 1 / length(vector));
}

function determinant(a, b, c) {
  return dot(a, cross(b, c));
}

function planeIntersection(a, b, c) {
  const denominator = determinant(a, b, c);
  if (Math.abs(denominator) < EPSILON) return undefined;
  const bc = cross(b, c);
  const ca = cross(c, a);
  const ab = cross(a, b);
  return scale(bc.map((value, index) => value + ca[index] + ab[index]),
    1 / denominator);
}

function polyhedronVertices(normals) {
  const vertices = [];
  for (let first = 0; first < normals.length; first += 1) {
    for (let second = first + 1; second < normals.length; second += 1) {
      for (let third = second + 1; third < normals.length; third += 1) {
        const point = planeIntersection(
          normals[first],
          normals[second],
          normals[third],
        );
        if (!point || normals.some((normal) => dot(normal, point) > 1 + EPSILON)) {
          continue;
        }
        if (!vertices.some((existing) =>
          length(subtract(existing, point)) < EPSILON
        )) vertices.push(point);
      }
    }
  }
  if (vertices.length !== 32) {
    throw new Error(`Expected 32 triacontahedron vertices; received ${vertices.length}.`);
  }
  return vertices;
}

function canonicalDirection(vector) {
  const direction = normalize(vector);
  const first = direction.find((value) => Math.abs(value) > EPSILON) ?? 1;
  return first < 0 ? scale(direction, -1) : direction;
}

function facePose(normal, vertices) {
  const faceVertices = vertices.filter((vertex) =>
    Math.abs(dot(normal, vertex) - 1) < EPSILON
  );
  if (faceVertices.length !== 4) {
    throw new Error(`A triacontahedron face has ${faceVertices.length} vertices.`);
  }
  let longestPair;
  let longestDistance = -Infinity;
  for (let first = 0; first < faceVertices.length; first += 1) {
    for (let second = first + 1; second < faceVertices.length; second += 1) {
      const distance = length(subtract(faceVertices[first], faceVertices[second]));
      if (distance > longestDistance) {
        longestDistance = distance;
        longestPair = [faceVertices[first], faceVertices[second]];
      }
    }
  }
  const xAxis = canonicalDirection(subtract(longestPair[0], longestPair[1]));
  const yAxis = normalize(cross(normal, xAxis));
  return {
    position: scale(normal, INRADIUS_MM),
    orientation: { xAxis, yAxis, normal },
  };
}

function roundNumber(value) {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Math.abs(rounded) < 1e-12 ? 0 : rounded;
}

function roundDeep(value) {
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, child]) => [key, roundDeep(child)],
    ));
  }
  return typeof value === "number" ? roundNumber(value) : value;
}

function triacontahedronFaceNormals() {
  const low = 1 / (2 * PHI);
  const middle = 0.5;
  const high = PHI / 2;
  const normals = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  for (const permutation of [
    [low, middle, high],
    [high, low, middle],
    [middle, high, low],
  ]) {
    for (const xSign of [-1, 1]) {
      for (const ySign of [-1, 1]) {
        for (const zSign of [-1, 1]) {
          normals.push([
            permutation[0] * xSign,
            permutation[1] * ySign,
            permutation[2] * zSign,
          ]);
        }
      }
    }
  }
  return normals.sort((first, second) =>
    second[2] - first[2] || first[1] - second[1] || first[0] - second[0]
  );
}

function draftWiring(panelCount) {
  const outputCount = Math.ceil(panelCount / 10);
  const baseLength = Math.floor(panelCount / outputCount);
  const remainder = panelCount % outputCount;
  return {
    status: "draft",
    controller: { placement: "near-top", status: "provisional" },
    routeStrategy: "face-adjacency-nearest-neighbor",
    panelRotationConstraint: "half-turns-only",
    chainLengths: Array.from(
      { length: outputCount },
      (_, index) => baseLength + (index < remainder ? 1 : 0),
    ),
    connector: { edgeInset: 4, surfaceOffset: 2.4 },
    outputs: Array.from({ length: outputCount }, (_, outputIndex) => ({
      outputIndex,
      label: `Output ${outputIndex + 1}`,
      gpio: null,
      color: ["#36e0d0", "#ff9d5c", "#a98bff", "#9ee56f"][outputIndex],
    })),
  };
}

function baseProject(id, name, panelProfile, panels) {
  return {
    $schema: "../../schemas/panel-assembly.schema.json",
    schemaVersion: "2.0.0",
    id,
    name,
    units: "mm",
    status: "provisional",
    panelProfile,
    panels,
    mapping: {
      projection: "equirectangular",
      logicalOrder: "north-to-south-then-longitude",
    },
    wiring: draftWiring(panels.length),
    calibration: {
      panelTransforms: "generated-provisional",
      installedPanelOrientation: "provisional",
      panelPixelOrder: "provisional",
      physicalChains: "provisional",
    },
    notes: [],
  };
}

function stableOptimization(definition, panelProfile) {
  let current = optimizeAutomaticWiring(definition, panelProfile);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = optimizeAutomaticWiring(current.definition, panelProfile);
    const currentAuthority = JSON.stringify({
      panels: current.definition.panels.map(({ id, pose }) => ({ id, pose })),
      outputs: current.definition.wiring.outputs,
    });
    const nextAuthority = JSON.stringify({
      panels: next.definition.panels.map(({ id, pose }) => ({ id, pose })),
      outputs: next.definition.wiring.outputs,
    });
    if (currentAuthority === nextAuthority) return current;
    current = next;
  }
  throw new Error("Automatic wiring did not reach a stable route and pose.");
}

const profile = JSON.parse(await readFile(PROFILE_SOURCE, "utf8"));
const xScale = CLIP_X_MM / 85;
const yScale = SHORT_HALF_MM / 55;
profile.dimensions = {
  width: roundNumber(LONG_HALF_MM * 2),
  height: roundNumber(SHORT_HALF_MM * 2),
  thickness: 1.6,
};
profile.carrier.outline = [
  [0, SHORT_HALF_MM],
  [-CLIP_X_MM, CLIP_Y_MM],
  [-CLIP_X_MM, -CLIP_Y_MM],
  [0, -SHORT_HALF_MM],
  [CLIP_X_MM, -CLIP_Y_MM],
  [CLIP_X_MM, CLIP_Y_MM],
];
profile.carrier.apertures = IMAGE_APERTURES.map(([id, x, y]) => ({
  id,
  center: [x * xScale, y * yScale],
  diameter: 4,
}));
profile.pixelGrid.localEmitterPositions = Array.from({ length: 8 }, (_, row) =>
  Array.from({ length: 8 }, (_, column) => {
    const a = (row + 0.5) / 8;
    const b = (column + 0.5) / 8;
    return [
      LONG_HALF_MM * (b - a),
      -SHORT_HALF_MM + SHORT_HALF_MM * (a + b),
      1.2,
    ];
  })
).flat();
for (const hole of profile.mounting.holes) {
  const source = COMPATIBILITY_HOLES[hole.id];
  if (!source) throw new Error(`Unknown compatibility hole ${hole.id}.`);
  hole.localPosition = [source[0] * xScale, source[1] * yScale];
}
profile.dataConnectors.localPositions.din = [0, -SHORT_HALF_MM + 4, -2.4];
profile.dataConnectors.localPositions.dout = [0, SHORT_HALF_MM - 4, -2.4];
profile.pixelGrid.provisionalOrder.description =
  "Visual placeholder over the image-derived 8 by 8 golden-rhombus lattice. The screenshot does not prove LED 0, traversal direction, or serpentine behavior.";
profile.mounting.physicalCorrections.note =
  "Compatibility placeholders only. The nine carrier apertures are the image-derived hole authority; fabrication is disabled.";
profile.dataConnectors.note =
  "DIN and DOUT are provisional opposite-tip anchors used only to make mapping and wiring available. The screenshot does not identify the actual data pads.";

const parsedProfile = parsePanelHardwareProfile(roundDeep(profile));
const panelProfile = {
  id: parsedProfile.id,
  source: "panel-profile.json",
};
const singleBase = baseProject(
  "image-derived-kicad-diamond-panel-demo",
  "Image-derived KiCad Diamond Panel",
  panelProfile,
  [{
    id: "DAVE-01",
    pose: {
      position: [0, 0, 0],
      orientation: {
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1],
      },
    },
  }],
);
const single = stableOptimization(singleBase, parsedProfile);
single.definition.notes = [
  "Visual-study fixture derived from the operator-supplied KiCad screenshot reference/davePCB.jpg.",
  "The screenshot supports a clipped golden-rhombus outline, an apparent 8 by 8 rhombic LED lattice, and nine circular board apertures.",
  "The 100 mm ideal edge is calibrated from the visible KiCad ruler. Thickness, emitter centres, aperture centres, DIN, DOUT, address order, RGB order, and electrical values remain provisional.",
  "Mapping, wiring, simulation, WLED setup, MadMapper export, and project save remain available. Automatic placement and rectangular-only fabrication are disabled.",
  `Automatic wiring revision ${single.definition.wiring.routeRevision} selected GPIO 16 and a stable one-panel pose; the estimated provisional data lead is ${single.estimatedCableLengthMm.toFixed(1)} mm.`,
];

const normals = triacontahedronFaceNormals();
const vertices = polyhedronVertices(normals);
const panels = normals.map((normal, index) => ({
  id: `DAVE-${String(index + 1).padStart(2, "0")}`,
  pose: roundDeep(facePose(normal, vertices)),
}));
const sculptureBase = baseProject(
  "image-derived-kicad-rhombic-triacontahedron",
  "KiCad Diamond Rhombic Triacontahedron",
  panelProfile,
  panels,
);
const sculpture = stableOptimization(sculptureBase, parsedProfile);
sculpture.definition.notes = [
  "Thirty image-derived KiCad diamond panels occupy the exact face planes of one rhombic triacontahedron.",
  "Each ideal golden-rhombus edge is 100 mm. Adjacent PCB edge segments coincide; the 4 mm acute-corner clips leave small openings at the star vertices.",
  "The saved half-turn-only constraint preserves the asymmetric golden-rhombus carrier while automatic wiring chooses balanced routes and GPIOs.",
  "All image-derived panel dimensions, apertures, emitters, connectors, address order, RGB order, and electrical values remain provisional. This project is not fabrication authority.",
  `Automatic wiring revision ${sculpture.definition.wiring.routeRevision} selected ${sculpture.definition.wiring.outputs.length} balanced outputs; estimated provisional data cable ${sculpture.estimatedCableLengthMm.toFixed(1)} mm.`,
];

await writeFile(PROFILE_SOURCE, `${JSON.stringify(roundDeep(profile), null, 2)}\n`);
await writeFile(SINGLE_SOURCE, `${JSON.stringify(roundDeep(single.definition), null, 2)}\n`);
await writeFile(SCULPTURE_SOURCE, `${JSON.stringify(roundDeep(sculpture.definition), null, 2)}\n`);
console.log(JSON.stringify({
  edgeMm: EDGE_MM,
  inradiusMm: roundNumber(INRADIUS_MM),
  longDiagonalMm: roundNumber(LONG_HALF_MM * 2),
  shortDiagonalMm: roundNumber(SHORT_HALF_MM * 2),
  outputPanels: sculpture.definition.wiring.chainLengths,
  cableMm: roundNumber(sculpture.estimatedCableLengthMm),
}, null, 2));
