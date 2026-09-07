export interface AudioEffect {
  id: number;
  name: string;
  speed: number;
  intensity: number;
  controls: {
    c1: number;
    c2: number;
    c3: number;
    o1: boolean;
    o2: boolean;
    o3: boolean;
  };
}

/** WLED /json/fxdata: controls;colors;palette;dimension/audio flags;defaults. */
export function audioEffectsFromDevice(
  info: unknown,
  names: unknown,
  metadata: unknown,
): AudioEffect[] {
  const usermods = (info as { um?: unknown } | null)?.um;
  if (!Array.isArray(usermods) || !usermods.includes(32)) return [];
  if (!Array.isArray(names) || !Array.isArray(metadata)) return [];
  return names.flatMap((name: unknown, id): AudioEffect[] => {
    const data: unknown = metadata[id];
    if (
      typeof name !== "string" ||
      !name ||
      name === "RSVD" ||
      typeof data !== "string"
    )
      return [];
    const fields = data.split(";");
    const flags = fields[3] ?? "";
    if (!flags.includes("1") || !/[vf]/.test(flags)) return [];
    const defaults = new URLSearchParams(
      (fields[4] ?? "").replaceAll(",", "&"),
    );
    const control = (key: string, fallback = 128, maximum = 255): number => {
      const value = Number(defaults.get(key) ?? fallback);
      return Number.isInteger(value) && value >= 0 && value <= maximum
        ? value
        : fallback;
    };
    return [
      {
        id,
        name,
        speed: control("sx"),
        intensity: control("ix"),
        controls: {
          c1: control("c1"),
          c2: control("c2"),
          c3: control("c3", 16, 31),
          o1: control("o1", 0, 1) === 1,
          o2: control("o2", 0, 1) === 1,
          o3: control("o3", 0, 1) === 1,
        },
      },
    ];
  });
}
