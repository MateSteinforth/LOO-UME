export interface EquatorPoint {
  longitude: number;
  height: number;
}

export async function equatorMappingSha256(
  points: readonly EquatorPoint[],
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(points)),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

interface PositionedLed {
  logicalIndex: number;
  x: number;
  y: number;
  z: number;
}

/** Compile Y-up coordinates in logical LED order. */
export function compileEquatorMapping(
  entries: readonly PositionedLed[],
): EquatorPoint[] {
  if (entries.length === 0) return [];
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();
  for (const entry of entries) {
    if (
      !Number.isInteger(entry.logicalIndex) ||
      entry.logicalIndex < 0 ||
      entry.logicalIndex >= entries.length ||
      seen.has(entry.logicalIndex)
    ) {
      throw new Error(
        "Equator Wave requires unique, contiguous logical LED indices.",
      );
    }
    seen.add(entry.logicalIndex);
    for (const [axis, value] of [entry.x, entry.y, entry.z].entries()) {
      if (!Number.isFinite(value))
        throw new Error("Equator Wave requires finite LED positions.");
      minimum[axis] = Math.min(minimum[axis]!, value);
      maximum[axis] = Math.max(maximum[axis]!, value);
    }
  }
  const center = minimum.map((value, axis) => value / 2 + maximum[axis]! / 2);
  const radius = entries.reduce(
    (value, entry) =>
      Math.max(
        value,
        Math.hypot(
          entry.x - center[0]!,
          entry.y - center[1]!,
          entry.z - center[2]!,
        ),
      ),
    0,
  );
  if (!Number.isFinite(radius))
    throw new Error("Equator Wave positions exceed the supported range.");
  const points: EquatorPoint[] = new Array<EquatorPoint>(entries.length);
  for (const entry of entries) {
    const angle = Math.atan2(entry.z - center[2]!, entry.x - center[0]!);
    points[entry.logicalIndex] = {
      longitude: Math.round(((angle / (Math.PI * 2) + 1) % 1) * 65536) & 65535,
      height:
        radius === 0
          ? 0
          : Math.round(((entry.y - center[1]!) / radius) * 32767),
    };
  }
  return points;
}
