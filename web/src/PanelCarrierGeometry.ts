import * as THREE from "three";
import {
  flexibleCarrierSegmentVertices,
  normalizePanelCarrier,
  type PanelCarrierProfile,
} from "../../src/sculpture/PanelCarrier.ts";

export type LocalCarrierPoint = [number, number, number];

export interface LocalPanelCarrierGeometry {
  triangles: LocalCarrierPoint[];
  outlineSegments: Array<[LocalCarrierPoint, LocalCarrierPoint]>;
}

function planarGeometry(
  outline: Array<[number, number]>,
): LocalPanelCarrierGeometry {
  const points = outline.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(points, []).flatMap(
    (indices) => indices.map((index) => {
      const point = outline[index]!;
      return [point[0], point[1], 0] as LocalCarrierPoint;
    }),
  );
  return {
    triangles,
    outlineSegments: outline.map((point, index) => [
      [point[0], point[1], 0],
      [
        outline[(index + 1) % outline.length]![0],
        outline[(index + 1) % outline.length]![1],
        0,
      ],
    ]),
  };
}

function flexiblePathGeometry(
  path: Array<[number, number, number]>,
  closed: boolean,
  width: number,
  thickness: number,
): LocalPanelCarrierGeometry {
  const triangles: LocalCarrierPoint[] = [];
  const outlineSegments: Array<[LocalCarrierPoint, LocalCarrierPoint]> = [];
  const segmentCount = closed ? path.length : path.length - 1;
  const faces = [
    [0, 2, 1], [1, 2, 3],
    [4, 5, 6], [5, 7, 6],
    [0, 1, 4], [1, 5, 4],
    [2, 6, 3], [3, 6, 7],
    [0, 4, 2], [2, 4, 6],
    [1, 3, 5], [3, 7, 5],
  ] as const;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = path[index]!;
    const end = path[(index + 1) % path.length]!;
    const vertices = flexibleCarrierSegmentVertices(
      start, end, width, thickness,
    );
    for (const face of faces) {
      for (const vertexIndex of face) {
        triangles.push(vertices[vertexIndex]!);
      }
    }
    outlineSegments.push([
      [...start],
      [...end],
    ]);
  }
  return { triangles, outlineSegments };
}

export function createLocalPanelCarrierGeometry(
  profile: PanelCarrierProfile,
): LocalPanelCarrierGeometry {
  const carrier = normalizePanelCarrier(profile);
  if (carrier.kind === "rectangular") {
    const halfWidth = profile.dimensions.width / 2;
    const halfHeight = profile.dimensions.height / 2;
    return planarGeometry([
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ]);
  }
  if (carrier.kind === "planar-outline") {
    return planarGeometry(carrier.outline);
  }
  return flexiblePathGeometry(
    carrier.path,
    carrier.closed,
    carrier.width,
    carrier.thickness,
  );
}
