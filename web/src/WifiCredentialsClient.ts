export interface WifiCredentials {
  ssid: string;
  password: string;
}

const STORAGE_KEY = "loo-ume.wifi-credentials.v1";
const ENDPOINT = "/api/wifi-credentials";

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function credentials(value: unknown): WifiCredentials | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WifiCredentials>;
  if (
    typeof candidate.ssid !== "string" ||
    typeof candidate.password !== "string"
  )
    return null;
  const size = new TextEncoder().encode(candidate.ssid).length;
  return size > 0 &&
    size <= 32 &&
    new TextEncoder().encode(candidate.password).length <= 64
    ? { ssid: candidate.ssid, password: candidate.password }
    : null;
}

export function createWifiCredentialsClient(
  request: typeof fetch = fetch,
  storage:
    | Pick<Storage, "getItem" | "setItem" | "removeItem">
    | undefined = browserStorage(),
  requireDesktop = globalThis.navigator?.userAgent.includes("Electron/") ??
    false,
) {
  let desktop: boolean | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<WifiCredentials | null> {
    const response = await request(ENDPOINT, {
      headers: { "X-LOO-UME-ESP32": "1" },
    });
    desktop =
      response.status !== 404 &&
      response.status !== 405 &&
      (response.headers.get("content-type")?.includes("application/json") ??
        false);
    if (!desktop && requireDesktop) {
      desktop = undefined;
      throw new Error("Desktop Wi-Fi storage is unavailable.");
    }
    if (desktop) {
      if (!response.ok)
        throw new Error("Saved Wi-Fi details could not be read.");
      const value = (await response.json()) as { credentials?: unknown };
      return credentials(value.credentials);
    }
    if (!response.ok && response.status !== 404 && response.status !== 405) {
      throw new Error("Saved Wi-Fi details could not be read.");
    }
    try {
      return credentials(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"));
    } catch {
      return null;
    }
  }
  function mutate(value: WifiCredentials | null): Promise<void> {
    const pending = queue
      .catch(() => undefined)
      .then(async () => {
        if (desktop === undefined) await read();
        if (desktop) {
          const response = await request(ENDPOINT, {
            method: value ? "PUT" : "DELETE",
            headers: {
              "X-LOO-UME-ESP32": "1",
              "Content-Type": "application/json",
            },
            ...(value ? { body: JSON.stringify(value) } : {}),
          });
          if (!response.ok)
            throw new Error(
              value
                ? "Wi-Fi details could not be saved."
                : "Saved Wi-Fi details could not be removed.",
            );
          storage?.removeItem(STORAGE_KEY);
        } else {
          if (!storage) throw new Error("Browser storage is unavailable.");
          if (value) storage.setItem(STORAGE_KEY, JSON.stringify(value));
          else storage.removeItem(STORAGE_KEY);
        }
      });
    queue = pending;
    return pending;
  }
  return {
    async load() {
      await queue.catch(() => undefined);
      return read();
    },
    save(value: WifiCredentials): Promise<void> {
      if (!credentials(value))
        return Promise.reject(
          new Error("Enter a valid Wi-Fi name and password."),
        );
      return mutate({ ...value });
    },
    forget: () => mutate(null),
  };
}
