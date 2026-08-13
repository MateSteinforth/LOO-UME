import type { Vector3Tuple } from "../sculpture/PanelOutlineBoundary.ts";

export interface StlInspection {
  format: "ascii" | "binary";
  triangles: number;
  bounds: {
    minimum: Vector3Tuple;
    maximum: Vector3Tuple;
  };
}

function finitePoint(values: readonly number[]): Vector3Tuple {
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("STL contains a non-finite vertex.");
  }
  return [values[0]!, values[1]!, values[2]!];
}

function inspectPoints(
  format: StlInspection["format"],
  triangles: number,
  points: Vector3Tuple[],
): StlInspection {
  if (triangles < 1 || points.length !== triangles * 3) {
    throw new Error("STL must contain at least one complete triangle.");
  }
  const minimum: Vector3Tuple = [Infinity, Infinity, Infinity];
  const maximum: Vector3Tuple = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, point[axis]!);
      maximum[axis] = Math.max(maximum[axis]!, point[axis]!);
    }
  }
  return { format, triangles, bounds: { minimum, maximum } };
}

export function inspectStl(bytes: Uint8Array): StlInspection {
  if (bytes.byteLength >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangles = view.getUint32(80, true);
    if (triangles > 0 && 84 + triangles * 50 === bytes.byteLength) {
      const points: Vector3Tuple[] = [];
      for (let triangle = 0; triangle < triangles; triangle += 1) {
        const offset = 84 + triangle * 50 + 12;
        for (let vertex = 0; vertex < 3; vertex += 1) {
          points.push(finitePoint(Array.from(
            { length: 3 },
            (_, axis) => view.getFloat32(offset + vertex * 12 + axis * 4, true),
          )));
        }
      }
      return inspectPoints("binary", triangles, points);
    }
  }

  const text = new TextDecoder().decode(bytes);
  if (
    !/^\s*solid(?:\s|$)/i.test(text) ||
    !/endsolid(?:\s+\S+)?\s*$/i.test(text)
  ) {
    throw new Error("STL is neither a complete binary STL nor a complete ASCII STL.");
  }
  const facets = text.match(/\bfacet\s+normal\b/gi)?.length ?? 0;
  const points = [...text.matchAll(
    /\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi,
  )].map((match) => finitePoint([
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]));
  return inspectPoints("ascii", facets, points);
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Cannot serialize a non-finite STL value.");
  return Math.abs(value) < 1e-12 ? "0" : Number(value.toFixed(9)).toString();
}

function normal(
  a: Vector3Tuple,
  b: Vector3Tuple,
  c: Vector3Tuple,
): Vector3Tuple {
  const ab: Vector3Tuple = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vector3Tuple = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const value: Vector3Tuple = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...value);
  if (length <= Number.EPSILON) throw new Error("Cannot serialize a degenerate STL triangle.");
  return [value[0] / length, value[1] / length, value[2] / length];
}

/** Deterministic ASCII STL serializer used for the exact validated boundary asset. */
export function serializeAsciiStl(
  name: string,
  vertices: readonly Vector3Tuple[],
  triangles: readonly (readonly [number, number, number])[],
): Uint8Array {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("STL name must be a lowercase slug.");
  const lines = [`solid ${name}`];
  for (const triangle of triangles) {
    const points = triangle.map((index) => vertices[index]);
    if (points.some((point) => point === undefined)) {
      throw new Error("STL triangle references an unknown vertex.");
    }
    const [a, b, c] = points as [Vector3Tuple, Vector3Tuple, Vector3Tuple];
    const n = normal(a, b, c);
    lines.push(`  facet normal ${n.map(number).join(" ")}`, "    outer loop");
    for (const point of points) lines.push(`      vertex ${point!.map(number).join(" ")}`);
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${name}`, "");
  const bytes = new TextEncoder().encode(lines.join("\n"));
  inspectStl(bytes);
  return bytes;
}
