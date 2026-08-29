export type PanelCarrierDefinition =
  | { kind: "rectangular" }
  | {
    kind: "planar-outline";
    outline: Array<[number, number]>;
  }
  | {
    kind: "flexible-path";
    path: Array<[number, number, number]>;
    closed: boolean;
    width: number;
    thickness: number;
  };

export interface PanelCarrierProfile {
  dimensions: { width: number; height: number; thickness: number };
  carrier?: PanelCarrierDefinition;
}

export type PanelCarrierPoint3 = [number, number, number];

function cross3(a: PanelCarrierPoint3, b: PanelCarrierPoint3): PanelCarrierPoint3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalized3(value: PanelCarrierPoint3): PanelCarrierPoint3 {
  const length = Math.hypot(...value);
  return value.map((coordinate) => coordinate / length) as PanelCarrierPoint3;
}

/** Exact segment prism used by both validation and browser rendering. */
export function flexibleCarrierSegmentVertices(
  start: PanelCarrierPoint3,
  end: PanelCarrierPoint3,
  width: number,
  thickness: number,
): PanelCarrierPoint3[] {
  const direction = normalized3([
    end[0] - start[0], end[1] - start[1], end[2] - start[2],
  ]);
  const reference: PanelCarrierPoint3 = Math.abs(direction[2]) < 0.95
    ? [0, 0, 1]
    : [0, 1, 0];
  const widthDirection = normalized3(cross3(reference, direction));
  const widthAxis = widthDirection.map(
    (coordinate) => coordinate * width / 2,
  ) as PanelCarrierPoint3;
  const thicknessDirection = normalized3(cross3(direction, widthDirection));
  const thicknessAxis = thicknessDirection.map(
    (coordinate) => coordinate * thickness / 2,
  ) as PanelCarrierPoint3;
  const vertex = (
    point: PanelCarrierPoint3,
    widthSign: -1 | 1,
    thicknessSign: -1 | 1,
  ): PanelCarrierPoint3 => [
    point[0] + widthSign * widthAxis[0] + thicknessSign * thicknessAxis[0],
    point[1] + widthSign * widthAxis[1] + thicknessSign * thicknessAxis[1],
    point[2] + widthSign * widthAxis[2] + thicknessSign * thicknessAxis[2],
  ];
  return [
    vertex(start, -1, -1), vertex(start, 1, -1),
    vertex(start, -1, 1), vertex(start, 1, 1),
    vertex(end, -1, -1), vertex(end, 1, -1),
    vertex(end, -1, 1), vertex(end, 1, 1),
  ];
}

export function normalizePanelCarrier(
  profile: PanelCarrierProfile,
): PanelCarrierDefinition {
  return profile.carrier
    ? structuredClone(profile.carrier)
    : { kind: "rectangular" };
}

export function supportsRectangularPanelTools(
  profile: PanelCarrierProfile,
): boolean {
  return normalizePanelCarrier(profile).kind === "rectangular";
}

export function assertRectangularPanelTools(
  profile: PanelCarrierProfile,
  operation: string,
): void {
  if (supportsRectangularPanelTools(profile)) return;
  throw new Error(
    `${operation} supports only rigid rectangular panel carriers. ` +
    "Mapping, wiring, simulation, and ESP32 setup remain available.",
  );
}

function finiteTuple(
  value: unknown,
  length: number,
): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate)
    );
}

function cross2(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  const abC = cross2(a, b, c);
  const abD = cross2(a, b, d);
  const cdA = cross2(c, d, a);
  const cdB = cross2(c, d, b);
  const epsilon = 1e-9;
  const onSegment = (
    start: readonly [number, number],
    end: readonly [number, number],
    point: readonly [number, number],
  ): boolean =>
    point[0] >= Math.min(start[0], end[0]) - epsilon &&
    point[0] <= Math.max(start[0], end[0]) + epsilon &&
    point[1] >= Math.min(start[1], end[1]) - epsilon &&
    point[1] <= Math.max(start[1], end[1]) + epsilon;
  if (
    ((abC > epsilon && abD < -epsilon) ||
      (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) ||
      (cdA < -epsilon && cdB > epsilon))
  ) return true;
  return (Math.abs(abC) <= epsilon && onSegment(a, b, c)) ||
    (Math.abs(abD) <= epsilon && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= epsilon && onSegment(c, d, b));
}

function validatePlanarOutline(
  outline: unknown,
  dimensions: PanelCarrierProfile["dimensions"],
): void {
  if (!Array.isArray(outline) || outline.length < 3) {
    throw new Error("A planar carrier outline requires at least three vertices.");
  }
  const points = outline.map((point) => {
    if (!finiteTuple(point, 2)) {
      throw new Error("Planar carrier vertices require two finite coordinates.");
    }
    return point as [number, number];
  });
  const keys = new Set(points.map((point) => point.join(",")));
  if (keys.size !== points.length) {
    throw new Error("Planar carrier vertices must be unique.");
  }
  if (points.some(([x, y]) =>
    Math.abs(x) > dimensions.width / 2 + 1e-9 ||
    Math.abs(y) > dimensions.height / 2 + 1e-9
  )) {
    throw new Error("Planar carrier vertices must stay inside profile dimensions.");
  }
  const signedArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  if (Math.abs(signedArea) <= 1e-9) {
    throw new Error("A planar carrier outline must have nonzero area.");
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second || firstNext === second ||
        secondNext === first
      ) continue;
      if (segmentsIntersect(
        points[first]!, points[firstNext]!,
        points[second]!, points[secondNext]!,
      )) {
        throw new Error("A planar carrier outline must be a simple polygon.");
      }
    }
  }
}

function validateFlexiblePath(
  carrier: Record<string, unknown>,
  dimensions: PanelCarrierProfile["dimensions"],
): void {
  if (typeof carrier.closed !== "boolean") {
    throw new Error("A flexible carrier path must declare whether it is closed.");
  }
  if (
    typeof carrier.width !== "number" || !Number.isFinite(carrier.width) ||
    carrier.width <= 0 ||
    typeof carrier.thickness !== "number" ||
    !Number.isFinite(carrier.thickness) || carrier.thickness <= 0
  ) {
    throw new Error("A flexible carrier requires positive finite width and thickness.");
  }
  const width = carrier.width as number;
  const thickness = carrier.thickness as number;
  if (
    !Array.isArray(carrier.path) ||
    carrier.path.length < (carrier.closed ? 3 : 2)
  ) {
    throw new Error("A flexible carrier path has too few points.");
  }
  const points = carrier.path.map((point) => {
    if (!finiteTuple(point, 3)) {
      throw new Error("Flexible carrier path points require three finite coordinates.");
    }
    return point as [number, number, number];
  });
  const segmentCount = carrier.closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const next = points[(index + 1) % points.length]!;
    const point = points[index]!;
    if (Math.hypot(
      next[0] - point[0], next[1] - point[1], next[2] - point[2],
    ) <= 1e-9) {
      throw new Error("Flexible carrier path segments must have nonzero length.");
    }
    const vertices = flexibleCarrierSegmentVertices(
      point, next, width, thickness,
    );
    if (vertices.some(([x, y, z]) =>
      Math.abs(x) > dimensions.width / 2 + 1e-9 ||
      Math.abs(y) > dimensions.height / 2 + 1e-9 ||
      Math.abs(z) > dimensions.thickness / 2 + 1e-9
    )) {
      throw new Error("A flexible carrier path must stay inside profile dimensions.");
    }
  }
}

export function validatePanelCarrier(
  carrier: unknown,
  dimensions: PanelCarrierProfile["dimensions"],
): void {
  if (carrier === undefined) return;
  if (typeof carrier !== "object" || carrier === null || Array.isArray(carrier)) {
    throw new Error("Panel carrier must be an object.");
  }
  const record = carrier as Record<string, unknown>;
  const hasOnly = (keys: readonly string[]): boolean =>
    Object.keys(record).every((key) => keys.includes(key));
  if (record.kind === "rectangular") {
    if (!hasOnly(["kind"])) {
      throw new Error("A rectangular carrier has unsupported fields.");
    }
    return;
  }
  if (record.kind === "planar-outline") {
    if (!hasOnly(["kind", "outline"])) {
      throw new Error("A planar carrier has unsupported fields.");
    }
    validatePlanarOutline(record.outline, dimensions);
    return;
  }
  if (record.kind === "flexible-path") {
    if (!hasOnly(["kind", "path", "closed", "width", "thickness"])) {
      throw new Error("A flexible carrier has unsupported fields.");
    }
    validateFlexiblePath(record, dimensions);
    return;
  }
  throw new Error("Panel carrier kind is not supported.");
}
