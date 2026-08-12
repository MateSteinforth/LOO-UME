import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Vector3Tuple = [number, number, number];

interface LegacyDefinition {
  schemaVersion: "1.0.0";
  panelProfile: string;
  geometry: {
    kind: "explicit-planar-face-graph";
    vertices: Vector3Tuple[];
    faces: Array<{ id: string; vertexIndices: number[] }>;
  };
  panels: Array<{
    id: string;
    faceId: string;
    rotationQuarterTurns: 0 | 1 | 2 | 3;
  }>;
  [key: string]: unknown;
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vector3Tuple, amount: number): Vector3Tuple {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...value);
  if (length < 1e-12) throw new Error("Cannot normalize a zero vector.");
  return scale(value, 1 / length);
}

function mean(values: Vector3Tuple[]): Vector3Tuple {
  const sum = values.reduce<Vector3Tuple>(
    (result, value) => [
      result[0] + value[0],
      result[1] + value[1],
      result[2] + value[2],
    ],
    [0, 0, 0],
  );
  return scale(sum, 1 / values.length);
}

function rotateAxes(
  xAxis: Vector3Tuple,
  yAxis: Vector3Tuple,
  quarterTurns: number,
): { xAxis: Vector3Tuple; yAxis: Vector3Tuple } {
  if (quarterTurns === 0) return { xAxis, yAxis };
  if (quarterTurns === 1) return { xAxis: yAxis, yAxis: scale(xAxis, -1) };
  if (quarterTurns === 2) {
    return { xAxis: scale(xAxis, -1), yAxis: scale(yAxis, -1) };
  }
  return { xAxis: scale(yAxis, -1), yAxis: xAxis };
}

function migrate(input: LegacyDefinition): Record<string, unknown> {
  if (input.schemaVersion !== "1.0.0") {
    throw new Error("Migration accepts panel-assembly schema 1.0.0 only.");
  }
  const faces = new Map(
    input.geometry.faces.map((face) => [face.id, face] as const),
  );
  const panels = input.panels.map((panel) => {
    const face = faces.get(panel.faceId);
    if (!face) throw new Error(`Panel ${panel.id} references ${panel.faceId}.`);
    const vertices = face.vertexIndices.map(
      (index) => input.geometry.vertices[index]!,
    );
    const position = mean(vertices);
    const firstEdge = subtract(vertices[1]!, vertices[0]!);
    const normal = normalize(
      cross(firstEdge, subtract(vertices[2]!, vertices[1]!)),
    );
    const baseX = normalize(firstEdge);
    const baseY = normalize(cross(normal, baseX));
    const { xAxis, yAxis } = rotateAxes(
      baseX,
      baseY,
      panel.rotationQuarterTurns,
    );
    return {
      id: panel.id,
      mountFaceId: panel.faceId,
      pose: {
        position,
        orientation: { xAxis, yAxis, normal },
      },
    };
  });
  const {
    geometry,
    panelProfile,
    schemaVersion: _schemaVersion,
    panels: _panels,
    ...rest
  } = input;
  return {
    ...rest,
    schemaVersion: "2.0.0",
    panelProfile: {
      id: panelProfile,
      source: `../../catalog/panels/${panelProfile}.json`,
    },
    panels,
    mechanicalShell: geometry,
  };
}

const sources = process.argv.slice(2);
if (sources.length === 0) {
  throw new Error(
    "Pass one or more schema-1.0 panel assembly sculpture JSON paths.",
  );
}
for (const source of sources) {
  const path = resolve(process.cwd(), source);
  const input = JSON.parse(await readFile(path, "utf8")) as LegacyDefinition;
  await writeFile(path, `${JSON.stringify(migrate(input), null, 2)}\n`, "utf8");
  console.log(`Migrated ${source} to pose-first schema 2.0.0.`);
}
