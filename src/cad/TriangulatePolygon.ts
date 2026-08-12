export type Point2 = readonly [number, number];

function cross(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - b[1]) -
    (b[1] - a[1]) * (c[0] - b[0]);
}

function signedArea(points: Point2[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function pointInTriangle(
  point: Point2,
  a: Point2,
  b: Point2,
  c: Point2,
  winding: number,
): boolean {
  const epsilon = 1e-9;
  return (
    winding * cross(a, b, point) >= -epsilon &&
    winding * cross(b, c, point) >= -epsilon &&
    winding * cross(c, a, point) >= -epsilon
  );
}

/** Triangulates a simple planar polygon while preserving its input winding. */
export function triangulatePolygon(
  vertexIndices: number[],
  points: Point2[],
): number[][] {
  if (vertexIndices.length !== points.length || points.length < 3) {
    throw new Error("Polygon triangulation requires matching vertices and points.");
  }
  if (points.length === 3) return [[...vertexIndices]];
  const winding = signedArea(points) >= 0 ? 1 : -1;
  const remaining = points.map((_, index) => index);
  const triangles: number[][] = [];
  let attempts = 0;
  while (remaining.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor - 1 + remaining.length) % remaining.length]!;
      const current = remaining[cursor]!;
      const next = remaining[(cursor + 1) % remaining.length]!;
      if (winding * cross(points[previous]!, points[current]!, points[next]!) <= 1e-9) {
        continue;
      }
      if (
        remaining.some(
          (candidate) =>
            candidate !== previous &&
            candidate !== current &&
            candidate !== next &&
            pointInTriangle(
              points[candidate]!,
              points[previous]!,
              points[current]!,
              points[next]!,
              winding,
            ),
        )
      ) {
        continue;
      }
      triangles.push([
        vertexIndices[previous]!,
        vertexIndices[current]!,
        vertexIndices[next]!,
      ]);
      remaining.splice(cursor, 1);
      clipped = true;
      break;
    }
    attempts += 1;
    if (!clipped || attempts > points.length * points.length) {
      throw new Error("Unable to triangulate a non-simple or degenerate polygon.");
    }
  }
  triangles.push(remaining.map((index) => vertexIndices[index]!));
  return triangles;
}
