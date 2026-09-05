import { isAbsolute } from "node:path";

export interface ElectronRuntime {
  editorUrl?: string;
  development: boolean;
}

function loopbackEditorUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function resolveElectronRuntime(
  environment: NodeJS.ProcessEnv = process.env,
  packaged = false,
): ElectronRuntime {
  if (environment.LOO_UME_ELECTRON_DEVELOPMENT !== "1") {
    return { development: false };
  }
  if (packaged) {
    throw new Error(
      "A packaged LOO/UME application cannot use development mode.",
    );
  }
  const editorUrl = loopbackEditorUrl(environment.LOO_UME_ELECTRON_DEV_URL);
  if (!editorUrl) {
    throw new Error(
      "Electron development requires a loopback LOO_UME_ELECTRON_DEV_URL.",
    );
  }
  return { development: true, editorUrl };
}

export function developmentUserDataDirectory(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (environment.LOO_UME_ELECTRON_DEVELOPMENT !== "1") return undefined;
  const directory = environment.LOO_UME_ELECTRON_DEVELOPMENT_DATA;
  return directory && isAbsolute(directory) ? directory : undefined;
}
