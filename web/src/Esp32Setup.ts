import SparkMD5 from "spark-md5";
import type { FlashOptions } from "esptool-js";
import { WLED_FIRMWARE_BUILD_RECEIPT as firmwareReceipt } from "../../src/wled/DeploymentContract.ts";

const CP2102_FILTER = { usbVendorId: 0x10c4, usbProductId: 0xea60 };
const SETUP_HOSTNAME = "loo-ume";
const REQUEST_TIMEOUT_MS = 10_000;

export type Esp32SetupMode = "smoke" | "installation";

export interface Esp32SetupPayload {
  mode: Esp32SetupMode;
  config: Record<string, unknown>;
  expectedLedCount: number;
  ledmapBytes?: string;
  state: Record<string, unknown>;
  expectedEffectName?: string;
  expectedPaletteName?: string;
}

export interface Esp32SetupControllerOptions {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  runButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  ssidInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  firmwareInput: HTMLInputElement;
  modeSelect: HTMLSelectElement;
  eraseConfirmation: HTMLInputElement;
  powerConfirmation: HTMLInputElement;
  setLogMessage(message: string, error?: boolean): void;
  getPayload(mode: Esp32SetupMode): Esp32SetupPayload;
}

interface FirmwareStatus {
  available: boolean;
  artifact: typeof firmwareReceipt.fullFlashArtifact;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLoopbackPage(): boolean {
  return window.isSecureContext &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1" ||
      location.hostname === "::1" || location.hostname === "[::1]");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyFullFlashBytes(bytes: Uint8Array): Promise<void> {
  const expected = firmwareReceipt.fullFlashArtifact;
  if (
    bytes.byteLength !== expected.byteLength ||
    await sha256(bytes) !== expected.sha256
  ) {
    throw new Error("The selected ESP32 image does not match the approved build receipt.");
  }
}

async function readJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} returned invalid JSON.`);
  }
  if (!response.ok) {
    const detail = typeof value === "object" && value !== null &&
        "error" in value && typeof value.error === "string"
      ? value.error
      : `HTTP ${response.status}`;
    throw new Error(`${context}: ${detail}`);
  }
  return value;
}

async function loadFirmware(file: File | undefined): Promise<Uint8Array> {
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await verifyFullFlashBytes(bytes);
    return bytes;
  }
  const statusValue = await readJsonResponse(
    await fetch("/api/esp32-firmware-status", {
      headers: { Accept: "application/json" },
    }),
    "Local firmware status",
  );
  const status = statusValue as Partial<FirmwareStatus>;
  if (
    status.available !== true ||
    status.artifact?.sha256 !== firmwareReceipt.fullFlashArtifact.sha256
  ) {
    throw new Error(
      "The approved full ESP32 image is not staged locally. Select the receipt-matching full-flash .bin file.",
    );
  }
  const response = await fetch("/api/esp32-firmware", {
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok) throw new Error(`Firmware download failed with HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await verifyFullFlashBytes(bytes);
  return bytes;
}

export function privateDeviceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error("WLED returned a non-HTTP device URL.");
  const octets = url.hostname.split(".").map(Number);
  const privateIpv4 = octets.length === 4 && octets.every((part) =>
    Number.isInteger(part) && part >= 0 && part <= 255
  ) && (
    octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 4 && octets[1] === 3 && octets[2] === 2 && octets[3] === 1)
  );
  if (!privateIpv4) throw new Error("WLED returned an address outside the local private network.");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function assertApprovedSerialDevice(info: SerialPortInfo): void {
  if (info.usbVendorId !== CP2102_FILTER.usbVendorId ||
      info.usbProductId !== CP2102_FILTER.usbProductId) {
    throw new Error("The selected serial device is not the approved CP2102 bridge.");
  }
}

export function assertApprovedEsp32Chip(chipName: string): void {
  if (chipName !== "ESP32") throw new Error(`Expected ESP32, but detected ${chipName}.`);
}

export function assertApprovedImprovIdentity(input: unknown): void {
  const info = input as { firmware?: unknown; chipFamily?: unknown } | undefined;
  if (info?.firmware !== "WLED" || info.chipFamily !== "esp32") {
    throw new Error("The flashed serial device did not identify as WLED on ESP32.");
  }
}

export function createEsp32FlashOptions(
  firmware: Uint8Array,
  reportProgress?: FlashOptions["reportProgress"],
): FlashOptions {
  return {
    fileArray: [{ data: firmware, address: firmwareReceipt.fullFlashArtifact.flashAddress }],
    flashMode: "dio",
    flashFreq: "40m",
    flashSize: "4MB",
    eraseAll: true,
    compress: true,
    calculateMD5Hash(image) {
      return SparkMD5.ArrayBuffer.hash(image.slice().buffer as ArrayBuffer);
    },
    reportProgress,
  };
}

async function deviceFetch(
  baseUrl: URL,
  path: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function postDeviceJson(
  baseUrl: URL,
  path: string,
  value: unknown,
): Promise<unknown> {
  return readJsonResponse(
    await deviceFetch(baseUrl, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
    `WLED ${path}`,
  );
}

export async function resolveVerifiedWledAddress(expectedMac: string): Promise<URL> {
  const mdnsUrl = new URL(`http://${SETUP_HOSTNAME}.local/`);
  const mdnsInfo = await readJsonResponse(
    await deviceFetch(mdnsUrl, "/json/info", undefined, 3_000),
    "WLED mDNS discovery",
  ) as { ip?: unknown; mac?: unknown };
  if (mdnsInfo.mac !== expectedMac) {
    throw new Error(`${mdnsUrl.host} resolved to a different WLED device.`);
  }
  if (typeof mdnsInfo.ip !== "string") {
    throw new Error("WLED mDNS discovery did not report its current IP address.");
  }
  const currentUrl = privateDeviceUrl(`http://${mdnsInfo.ip}/`);
  const currentInfo = await readJsonResponse(
    await deviceFetch(currentUrl, "/json/info", undefined, 3_000),
    "WLED IP discovery",
  ) as { ip?: unknown; mac?: unknown };
  if (currentInfo.mac !== expectedMac || currentInfo.ip !== currentUrl.hostname) {
    throw new Error("The current WLED IP address does not match the expected device.");
  }
  return currentUrl;
}

async function discoverRestartedDevice(
  expectedMac: string,
  timeoutMs = 45_000,
): Promise<URL> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await resolveVerifiedWledAddress(expectedMac);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`WLED did not return after restart: ${errorMessage(lastError)}`);
}

async function setAndVerifyDeviceIdentity(baseUrl: URL): Promise<URL> {
  const initialInfo = await readJsonResponse(
    await deviceFetch(baseUrl, "/json/info"),
    "WLED identity",
  ) as { mac?: unknown };
  if (typeof initialInfo.mac !== "string") {
    throw new Error("WLED did not report a device MAC address.");
  }
  await postDeviceJson(baseUrl, "/json/cfg", {
    id: { mdns: SETUP_HOSTNAME, name: "LOO/UME" },
  });
  const reset = await deviceFetch(baseUrl, "/reset");
  if (!reset.ok) throw new Error(`WLED restart failed with HTTP ${reset.status}.`);
  return discoverRestartedDevice(initialInfo.mac);
}

function expectedBuses(config: Record<string, unknown>): unknown[] {
  const hw = config.hw as { led?: { ins?: unknown[] } } | undefined;
  if (!Array.isArray(hw?.led?.ins)) throw new Error("The selected WLED config has no bus list.");
  return hw.led.ins;
}

export function assertConfigReadback(input: unknown, payload: Esp32SetupPayload): void {
  if (typeof input !== "object" || input === null) {
    throw new Error("WLED configuration read-back is invalid.");
  }
  const config = input as {
    id?: { mdns?: unknown };
    hw?: { led?: { total?: unknown; ins?: unknown[] } };
  };
  const expected = expectedBuses(payload.config) as Array<Record<string, unknown>>;
  const actual = config.hw?.led?.ins;
  const busesMatch = Array.isArray(actual) && actual.length === expected.length &&
    expected.every((expectedBus, index) => {
      const actualBus = actual[index];
      return typeof actualBus === "object" && actualBus !== null &&
        Object.entries(expectedBus).every(([key, value]) =>
          JSON.stringify((actualBus as Record<string, unknown>)[key]) ===
            JSON.stringify(value)
        );
    });
  if (
    config.id?.mdns !== SETUP_HOSTNAME ||
    config.hw?.led?.total !== payload.expectedLedCount ||
    !busesMatch
  ) {
    throw new Error("WLED configuration read-back does not match the selected setup.");
  }
}

export function remapStateToLiveTables(
  payload: Esp32SetupPayload,
  effects: unknown,
  palettes: unknown,
): void {
  const segment = payload.state.seg as { fx?: number; pal?: number } | undefined;
  const effectIndex = Array.isArray(effects)
    ? effects.indexOf(payload.expectedEffectName)
    : -1;
  const paletteIndex = Array.isArray(palettes)
    ? palettes.indexOf(payload.expectedPaletteName)
    : -1;
  if (!segment || effectIndex < 0 || paletteIndex < 0) {
    throw new Error("The live WLED effect or palette table does not match the simulator.");
  }
  segment.fx = effectIndex;
  segment.pal = paletteIndex;
}

export function assertStateReadback(input: unknown, payload: Esp32SetupPayload): void {
  if (typeof input !== "object" || input === null) {
    throw new Error("WLED state read-back is invalid.");
  }
  const expected = payload.state as {
    on?: unknown;
    bri?: unknown;
    seg?: Record<string, unknown>;
  };
  const actual = input as {
    on?: unknown;
    bri?: unknown;
    seg?: Array<Record<string, unknown>>;
  };
  const actualSegment = actual.seg?.[0];
  const keys = ["start", "stop", "fx", "pal", "sx", "ix"] as const;
  if (
    actual.on !== expected.on ||
    actual.bri !== expected.bri ||
    !actualSegment ||
    keys.some((key) => expected.seg?.[key] !== undefined &&
      actualSegment[key] !== expected.seg[key])
  ) {
    throw new Error("WLED state read-back does not match the simulator state.");
  }
}

async function applyAndVerifyDevice(
  baseUrl: URL,
  payload: Esp32SetupPayload,
  update: (message: string) => void,
): Promise<void> {
  update(`Applying ${payload.mode === "smoke" ? "one-panel" : "installation"} configuration.`);
  const config = structuredClone(payload.config);
  config.id = { mdns: SETUP_HOSTNAME, name: "LOO/UME" };
  await postDeviceJson(baseUrl, "/json/cfg", config);

  if (payload.ledmapBytes !== undefined) {
    const data = new FormData();
    data.append("data", new Blob([payload.ledmapBytes], { type: "application/json" }), "ledmap.json");
    const upload = await deviceFetch(baseUrl, "/upload", { method: "POST", body: data });
    if (!upload.ok) throw new Error(`WLED ledmap upload failed with HTTP ${upload.status}.`);
    const readback = await deviceFetch(baseUrl, "/edit?func=edit&path=/ledmap.json");
    if (!readback.ok || JSON.stringify(JSON.parse(await readback.text())) !==
        JSON.stringify(JSON.parse(payload.ledmapBytes))) {
      throw new Error("WLED ledmap read-back does not match the deployment artifact.");
    }
  }

  if (payload.expectedEffectName || payload.expectedPaletteName) {
    const [effects, palettes] = await Promise.all([
      readJsonResponse(await deviceFetch(baseUrl, "/json/eff"), "WLED effect list"),
      readJsonResponse(await deviceFetch(baseUrl, "/json/pal"), "WLED palette list"),
    ]);
    remapStateToLiveTables(payload, effects, palettes);
  }

  await postDeviceJson(baseUrl, "/json/state", payload.state);
  const [configuration, information, state] = await Promise.all([
    readJsonResponse(await deviceFetch(baseUrl, "/json/cfg"), "WLED config read-back"),
    readJsonResponse(await deviceFetch(baseUrl, "/json/info"), "WLED firmware read-back"),
    readJsonResponse(await deviceFetch(baseUrl, "/json/state"), "WLED state read-back"),
  ]);
  assertConfigReadback(configuration, payload);
  assertStateReadback(state, payload);
  const info = information as { arch?: unknown; leds?: { count?: unknown } };
  if (info.arch !== "esp32" || info.leds?.count !== payload.expectedLedCount) {
    throw new Error("The live WLED target or LED count does not match the setup.");
  }
}

async function openImprov(port: SerialPort): Promise<InstanceType<
  typeof import("improv-wifi-serial-sdk/dist/serial.js")["ImprovSerial"]
>> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  await port.open({ baudRate: 115200 });
  const { ImprovSerial } = await import("improv-wifi-serial-sdk/dist/serial.js");
  const improv = new ImprovSerial(port, { log() {}, error() {}, debug() {} });
  await improv.initialize(15_000);
  try {
    assertApprovedImprovIdentity(improv.info);
  } catch (error) {
    await improv.close();
    throw error;
  }
  return improv;
}

async function runSetup(
  options: Esp32SetupControllerOptions,
  payload: Esp32SetupPayload,
): Promise<void> {
  if (!isLoopbackPage()) {
    throw new Error("ESP32 setup is available only from the local desktop page in Chrome or Edge.");
  }
  const ssid = options.ssidInput.value.trim();
  if (ssid.length === 0 || ssid.length > 32) {
    throw new Error("Enter the 2.4 GHz Wi-Fi network name (1–32 characters).");
  }
  if (options.passwordInput.value.length > 64) {
    throw new Error("The Wi-Fi password must be at most 64 characters.");
  }
  if (!options.eraseConfirmation.checked || !options.powerConfirmation.checked) {
    throw new Error("Confirm the full erase and disconnected LED power before setup.");
  }
  options.setLogMessage("Verifying the approved complete ESP32 image.");
  const firmware = await loadFirmware(options.firmwareInput.files?.[0]);
  if (!("serial" in navigator)) {
    throw new Error("This browser does not support Web Serial. Use Chrome or Edge.");
  }
  const serial = navigator.serial;
  options.setLogMessage("Select the Silicon Labs CP2102 USB serial device.");
  const port = await serial.requestPort({ filters: [CP2102_FILTER] });
  assertApprovedSerialDevice(port.getInfo());

  const { ESPLoader, Transport } = await import("esptool-js");
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 460800,
    terminal: {
      clean() {},
      write() {},
      writeLine(message) {
        if (/Connecting|Chip is|Writing at|Hash of data verified/i.test(message)) {
          options.setLogMessage(message.trim());
        }
      },
    },
  });
  let improv: Awaited<ReturnType<typeof openImprov>> | undefined;
  try {
    const chipName = await loader.main();
    assertApprovedEsp32Chip(chipName);
    await loader.writeFlash(createEsp32FlashOptions(
      firmware,
      (_fileIndex, written, total) => {
        const percent = total === 0 ? 0 : Math.floor(written / total * 100);
        options.setLogMessage(`Flashing approved WLED image: ${percent}%.`);
      },
    ));
    await loader.after("hard_reset");
    await transport.disconnect();

    options.setLogMessage("Provisioning Wi-Fi over USB. Credentials stay only in this page.");
    improv = await openImprov(port);
    await improv.provision(ssid, options.passwordInput.value, 60_000);
    if (!improv.nextUrl) throw new Error("WLED did not return its local network address.");
    let deviceUrl = privateDeviceUrl(improv.nextUrl);
    await improv.close();
    improv = undefined;
    await port.close();

    options.setLogMessage(`Verifying ${SETUP_HOSTNAME}.local after restart.`);
    deviceUrl = await setAndVerifyDeviceIdentity(deviceUrl);
    await applyAndVerifyDevice(deviceUrl, payload, options.setLogMessage);
    options.setLogMessage(
      `ESP32 setup verified at ${deviceUrl.host}. ${SETUP_HOSTNAME}.local resolves to this device.`,
    );
  } finally {
    options.passwordInput.value = "";
    if (improv) await improv.close().catch(() => undefined);
    await transport.disconnect().catch(() => undefined);
    if (port.readable || port.writable) await port.close().catch(() => undefined);
  }
}

export function createEsp32SetupController(options: Esp32SetupControllerOptions): void {
  options.openButton.addEventListener("click", () => options.dialog.showModal());
  const clearPassword = (): void => {
    options.passwordInput.value = "";
  };
  options.closeButton.addEventListener("click", () => {
    clearPassword();
    options.dialog.close();
  });
  options.dialog.addEventListener("close", clearPassword);
  options.dialog.addEventListener("cancel", clearPassword);
  options.runButton.addEventListener("click", () => {
    options.runButton.disabled = true;
    try {
      const mode = options.modeSelect.value as Esp32SetupMode;
      if (mode !== "smoke") {
        throw new Error("Full installation setup is unavailable until its hardware power gate passes.");
      }
      const payload = options.getPayload(mode);
      void runSetup(options, payload)
        .then(() => options.dialog.close())
        .catch((error) => options.setLogMessage(errorMessage(error), true))
        .finally(() => {
          clearPassword();
          options.runButton.disabled = false;
        });
    } catch (error) {
      clearPassword();
      options.setLogMessage(errorMessage(error), true);
      options.runButton.disabled = false;
    }
  });
}
