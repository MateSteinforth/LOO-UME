import * as THREE from "three";
import {
  flexibleCarrierSegmentVertices,
  normalizePanelCarrier,
  type PanelCarrierProfile,
} from "../../src/sculpture/PanelCarrier.ts";
import {
  panelBackViewPointToOutwardPoseLocal,
  type PanelMountingHoleDefinition,
} from "../../src/sculpture/Definition.ts";

export type LocalCarrierPoint = [number, number, number];

export interface LocalPanelCarrierGeometry {
  triangles: LocalCarrierPoint[];
  outlineSegments: Array<[LocalCarrierPoint, LocalCarrierPoint]>;
}

export function usesExplicitRadialCarrierEmitters(
  profile: PanelCarrierProfile & {
    pixelGrid?: { localEmitterPositions?: unknown };
  },
): boolean {
  return profile.carrier?.kind === "flexible-path" &&
    profile.carrier.frame?.kind === "radial-outward" &&
    Array.isArray(profile.pixelGrid?.localEmitterPositions);
}

type MountingHoleCarrierProfile = PanelCarrierProfile & {
  mounting?: {
    physicalCorrections?: {
      status?: "provisional" | "measured";
    };
    pcbHolePreviewDiameter: number;
    holes: PanelMountingHoleDefinition[];
  };
};

export function panelCarrierMountingHoleCenters(
  profile: MountingHoleCarrierProfile,
): Array<[number, number]> {
  return profile.mounting?.holes.map(({ localPosition }) =>
    panelBackViewPointToOutwardPoseLocal(localPosition)
  ) ?? [];
}

export function panelCarrierApertures(
  profile: PanelCarrierProfile,
): Array<{ center: [number, number]; diameter: number }> {
  const carrier = normalizePanelCarrier(profile);
  return carrier.kind === "planar-outline"
    ? carrier.apertures?.map(({ center, diameter }) => ({
      center: [...center],
      diameter,
    })) ?? []
    : [];
}

function circularHole(
  center: [number, number],
  radius: number,
  segments = 20,
): THREE.Vector2[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = -2 * Math.PI * index / segments;
    return new THREE.Vector2(
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    );
  });
}

function planarGeometry(
  outline: Array<[number, number]>,
  holes: THREE.Vector2[][] = [],
): LocalPanelCarrierGeometry {
  const points = outline.map(([x, y]) => new THREE.Vector2(x, y));
  const allPoints = [...points, ...holes.flat()];
  const triangles = THREE.ShapeUtils.triangulateShape(points, holes).flatMap(
    (indices) => indices.map((index) => {
      const point = allPoints[index]!;
      return [point.x, point.y, 0] as LocalCarrierPoint;
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
  radialCenter?: LocalCarrierPoint,
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
      start, end, width, thickness, radialCenter,
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
  profile: MountingHoleCarrierProfile,
): LocalPanelCarrierGeometry {
  const carrier = normalizePanelCarrier(profile);
  const apertures = panelCarrierApertures(profile);
  const mountingHoles = apertures.length > 0
    ? apertures.map(({ center, diameter }) => circularHole(center, diameter / 2))
    : profile.mounting
    ? panelCarrierMountingHoleCenters(profile).map((center) =>
      circularHole(center, profile.mounting!.pcbHolePreviewDiameter / 2)
    )
    : [];
  if (carrier.kind === "rectangular") {
    const halfWidth = profile.dimensions.width / 2;
    const halfHeight = profile.dimensions.height / 2;
    return planarGeometry([
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ], mountingHoles);
  }
  if (carrier.kind === "planar-outline") {
    return planarGeometry(carrier.outline, mountingHoles);
  }
  return flexiblePathGeometry(
    carrier.path,
    carrier.closed,
    carrier.width,
    carrier.thickness,
    carrier.frame?.center,
  );
}
