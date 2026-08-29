import { zipSync } from "fflate";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import {
  assertPortableProjectAssetSource,
  sha256Bytes,
} from "../../src/sculpture/GeneratedMechanics.ts";
import {
  createPortableProjectFiles,
  portableProjectFolderName,
  unzipPortableProjectFiles,
} from "./PortableProject.ts";

export const PROJECT_PACKAGE_SCHEMA_VERSION = "1.0.0" as const;
export const PROJECT_PACKAGE_THUMBNAIL = "thumbnail.svg";
export const PROJECT_PACKAGE_RENDERED_THUMBNAIL = "thumbnail.png";

export interface ProjectPackageThumbnail {
  bytes: Uint8Array;
  mediaType: "image/png" | "image/svg+xml";
}

export interface ProjectPackageManifest {
  schemaVersion: typeof PROJECT_PACKAGE_SCHEMA_VERSION;
  id: string;
  name: string;
  sculpture: "sculpture.json";
  sculptureSha256: string;
  thumbnail: typeof PROJECT_PACKAGE_THUMBNAIL | typeof PROJECT_PACKAGE_RENDERED_THUMBNAIL;
  panelCount: number;
}

export interface ProjectPackageSummary {
  manifest: ProjectPackageManifest;
  thumbnailBytes: Uint8Array;
  thumbnailMediaType: "image/png" | "image/svg+xml";
}

export function createProjectThumbnailSvg(
  definition: PanelAssemblyDefinition,
): Uint8Array {
  const width = 480;
  const height = 300;
  const points = definition.panels.map((panel) => {
    const [x, y, z] = panel.pose.position;
    return { x: x - z * 0.55, y: -y + z * 0.25, depth: z };
  });
  const fallback = points.length === 0
    ? [{ x: -1, y: -1, depth: 0 }, { x: 1, y: 1, depth: 0 }]
    : points;
  const minX = Math.min(...fallback.map((point) => point.x));
  const maxX = Math.max(...fallback.map((point) => point.x));
  const minY = Math.min(...fallback.map((point) => point.y));
  const maxY = Math.max(...fallback.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min(350 / spanX, 190 / spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const ordered = [...points].sort((left, right) => left.depth - right.depth);
  const marks = ordered.length === 0
    ? `<circle cx="240" cy="150" r="54" fill="none" stroke="#39d9d0" stroke-width="4" stroke-dasharray="8 10"/>`
    : ordered.map((point, index) => {
      const x = 240 + (point.x - centerX) * scale;
      const y = 150 + (point.y - centerY) * scale;
      const hue = 174 + Math.round(index / Math.max(ordered.length - 1, 1) * 34);
      return `<rect x="${(x - 5).toFixed(2)}" y="${(y - 5).toFixed(2)}" width="10" height="10" rx="2" transform="rotate(45 ${x.toFixed(2)} ${y.toFixed(2)})" fill="hsl(${hue} 76% 60%)" stroke="#d9fffb" stroke-width="1"/>`;
    }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><radialGradient id="bg" cx="38%" cy="28%"><stop stop-color="#18364a"/><stop offset="1" stop-color="#050811"/></radialGradient></defs><rect width="480" height="300" rx="18" fill="url(#bg)"/><g>${marks}</g></svg>`;
  return new TextEncoder().encode(svg);
}

export function createProjectPackageManifest(
  definition: PanelAssemblyDefinition,
  sculptureBytes: Uint8Array,
): ProjectPackageManifest {
  return {
    schemaVersion: PROJECT_PACKAGE_SCHEMA_VERSION,
    id: definition.id,
    name: definition.name,
    sculpture: "sculpture.json",
    sculptureSha256: sha256Bytes(sculptureBytes),
    thumbnail: PROJECT_PACKAGE_THUMBNAIL,
    panelCount: definition.panels.length,
  };
}

export function createProjectPackageZip(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  folderName = portableProjectFolderName(definition),
  thumbnail?: ProjectPackageThumbnail,
): Uint8Array {
  if (folderName.includes("/")) {
    throw new Error("Project package folder name must be one safe path segment.");
  }
  assertPortableProjectAssetSource(folderName, "Project package folder");
  const files = createPortableProjectFiles(definition, availableAssets);
  const sculptureBytes = files.get("sculpture.json")!;
  const manifest = createProjectPackageManifest(definition, sculptureBytes);
  if (thumbnail?.mediaType === "image/png") {
    manifest.thumbnail = PROJECT_PACKAGE_RENDERED_THUMBNAIL;
  }
  files.set("manifest.json", new TextEncoder().encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  ));
  files.set(
    manifest.thumbnail,
    thumbnail?.bytes ?? createProjectThumbnailSvg(definition),
  );
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of files) entries[`${folderName}/${path}`] = bytes;
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}

function parseManifest(bytes: Uint8Array): ProjectPackageManifest {
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`Project package manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = input as Partial<ProjectPackageManifest>;
  if (
    value.schemaVersion !== PROJECT_PACKAGE_SCHEMA_VERSION ||
    typeof value.id !== "string" || value.id.length === 0 || value.id.length > 160 ||
    typeof value.name !== "string" || value.name.length === 0 || value.name.length > 240 ||
    value.sculpture !== "sculpture.json" ||
    !/^[0-9a-f]{64}$/.test(value.sculptureSha256 ?? "") ||
    (value.thumbnail !== PROJECT_PACKAGE_THUMBNAIL &&
      value.thumbnail !== PROJECT_PACKAGE_RENDERED_THUMBNAIL) ||
    !Number.isInteger(value.panelCount) || (value.panelCount ?? -1) < 0
  ) {
    throw new Error("Project package manifest is invalid.");
  }
  return value as ProjectPackageManifest;
}

export function readProjectPackageSummary(
  zipBytes: Uint8Array,
): ProjectPackageSummary {
  const files = unzipPortableProjectFiles(zipBytes);
  const sculpture = files.filter(({ path }) =>
    path === "sculpture.json" || path.endsWith("/sculpture.json")
  );
  if (sculpture.length !== 1) {
    throw new Error("Project package must contain one sculpture.json.");
  }
  const root = sculpture[0]!.path.slice(0, -"sculpture.json".length);
  const byPath = new Map(files.map((file) => [file.path, file.bytes]));
  const manifestBytes = byPath.get(`${root}manifest.json`);
  if (!manifestBytes) throw new Error("Project package is missing manifest.json.");
  const manifest = parseManifest(manifestBytes);
  if (sha256Bytes(sculpture[0]!.bytes) !== manifest.sculptureSha256) {
    throw new Error("Project package sculpture.json does not match its manifest.");
  }
  const thumbnailBytes = byPath.get(`${root}${manifest.thumbnail}`);
  if (!thumbnailBytes || thumbnailBytes.byteLength === 0) {
    throw new Error("Project package is missing its thumbnail.");
  }
  return {
    manifest,
    thumbnailBytes: Uint8Array.from(thumbnailBytes),
    thumbnailMediaType: manifest.thumbnail === PROJECT_PACKAGE_RENDERED_THUMBNAIL
      ? "image/png"
      : "image/svg+xml",
  };
}
