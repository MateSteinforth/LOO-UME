export type Vector3Tuple = [number, number, number];

export interface DesignSurfaceDefinition {
  kind: "triangle-mesh";
  format: "glb";
  source: string;
  sha256: string;
  scaleToMillimeters: number;
  status: "watertight";
}

export interface SurfaceAttachment {
  triangleIndex: number;
  barycentric: Vector3Tuple;
  normalOffset: number;
}

export interface SurfaceMeshValidation {
  watertight: true;
  vertexCount: number;
  triangleCount: number;
  signedVolume: number;
  bounds: {
    minimum: Vector3Tuple;
    maximum: Vector3Tuple;
    size: Vector3Tuple;
  };
}

interface WeldedTriangle {
  vertices: [number, number, number];
}

function edgeKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function quantizedKey(
  x: number,
  y: number,
  z: number,
  tolerance: number,
): string {
  return `${Math.round(x / tolerance)}:${Math.round(y / tolerance)}:${Math.round(z / tolerance)}`;
}

/** Validates a connected, consistently wound, closed triangle mesh. */
export function validateWatertightTriangleMesh(
  positions: readonly number[],
  indices: readonly number[],
): SurfaceMeshValidation {
  if (positions.length < 12 || positions.length % 3 !== 0) {
    throw new Error("A design surface needs at least four finite vertices.");
  }
  if (
    positions.some((coordinate) => !Number.isFinite(coordinate)) ||
    indices.length < 3 ||
    indices.length % 3 !== 0 ||
    indices.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= positions.length / 3,
    )
  ) {
    throw new Error("The GLB must contain finite, indexed triangles.");
  }

  const minimum: Vector3Tuple = [Infinity, Infinity, Infinity];
  const maximum: Vector3Tuple = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[index + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[index + axis]!);
    }
  }
  const size: Vector3Tuple = [
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
  ];
  const diagonal = Math.hypot(...size);
  if (diagonal < 1e-8) throw new Error("The GLB design surface has zero size.");
  const tolerance = Math.max(diagonal * 1e-7, 1e-7);
  const weldedByPosition = new Map<string, number>();
  const weldedSourceIndices: number[] = [];
  for (let sourceIndex = 0; sourceIndex < positions.length / 3; sourceIndex += 1) {
    const offset = sourceIndex * 3;
    const key = quantizedKey(
      positions[offset]!,
      positions[offset + 1]!,
      positions[offset + 2]!,
      tolerance,
    );
    let weldedIndex = weldedByPosition.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = weldedByPosition.size;
      weldedByPosition.set(key, weldedIndex);
    }
    weldedSourceIndices[sourceIndex] = weldedIndex;
  }

  const triangles: WeldedTriangle[] = [];
  const edgeUses = new Map<
    string,
    Array<{ triangleIndex: number; from: number; to: number }>
  >();
  let signedVolume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const source = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!] as const;
    const welded = source.map((index) => weldedSourceIndices[index]!) as [
      number,
      number,
      number,
    ];
    if (new Set(welded).size !== 3) {
      throw new Error("The GLB contains a degenerate triangle after vertex welding.");
    }
    const triangleIndex = triangles.length;
    triangles.push({ vertices: welded });
    for (const [from, to] of [
      [welded[0], welded[1]],
      [welded[1], welded[2]],
      [welded[2], welded[0]],
    ] as Array<[number, number]>) {
      const key = edgeKey(from, to);
      const uses = edgeUses.get(key) ?? [];
      uses.push({ triangleIndex, from, to });
      edgeUses.set(key, uses);
    }
    const a = source[0] * 3;
    const b = source[1] * 3;
    const c = source[2] * 3;
    signedVolume +=
      (positions[a]! *
        (positions[b + 1]! * positions[c + 2]! -
          positions[b + 2]! * positions[c + 1]!) -
        positions[a + 1]! *
          (positions[b]! * positions[c + 2]! -
            positions[b + 2]! * positions[c]!) +
        positions[a + 2]! *
          (positions[b]! * positions[c + 1]! -
            positions[b + 1]! * positions[c]!)) /
      6;
  }

  const adjacency = triangles.map(() => new Set<number>());
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) {
      throw new Error(
        `The GLB is not watertight: an edge has ${uses.length} incident triangles.`,
      );
    }
    if (uses[0]!.from === uses[1]!.from && uses[0]!.to === uses[1]!.to) {
      throw new Error("The GLB has inconsistent triangle winding.");
    }
    adjacency[uses[0]!.triangleIndex]!.add(uses[1]!.triangleIndex);
    adjacency[uses[1]!.triangleIndex]!.add(uses[0]!.triangleIndex);
  }
  const visited = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    for (const neighbor of adjacency[queue.shift()!]!) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  if (visited.size !== triangles.length) {
    throw new Error("The GLB design surface must contain one connected shell.");
  }
  if (Math.abs(signedVolume) < diagonal ** 3 * 1e-10) {
    throw new Error("The GLB design surface encloses no measurable volume.");
  }
  return {
    watertight: true,
    vertexCount: weldedByPosition.size,
    triangleCount: triangles.length,
    signedVolume,
    bounds: { minimum, maximum, size },
  };
}
