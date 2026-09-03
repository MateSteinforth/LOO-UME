import SparkMD5 from "spark-md5";
import type { FlashOptions } from "esptool-js";
import { WLED_FIRMWARE_BUILD_RECEIPT as firmwareReceipt } from "../../src/wled/DeploymentContract.ts";

const CP2102_FILTER = { usbVendorId: 0x10c4, usbProductId: 0xea60 };
export const AUTOMATIC_RECONNECT_STORAGE_KEY = "loo-ume:esp32-reconnect-enabled";
const SETUP_HOSTNAME = "loo-ume";
const REQUEST_TIMEOUT_MS = 10_000;
const WLED_COLOR_GAMMA = 2.2;
export const STANDALONE_PRESET_ID = 1;
export const ESP32_FLASH_BAUD_RATE = 115200;
export const RESTART_VERIFICATION_REQUEST_TIMEOUT_MS = 10_000;
export const RESTART_VERIFICATION_DEADLINE_MS = 45_000;
export const RESTART_VERIFICATION_MINIMUM_WINDOW_MS = 8_500;
export const PRESET_PERSISTENCE_DEADLINE_MS = 20_000;
const APPROVED_CLASSIC_ESP32_OUTPUT_GPIOS = new Set([
  4, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33,
]);

export function isApprovedEsp32OutputGpio(gpio: number): boolean {
  return Number.isInteger(gpio) && APPROVED_CLASSIC_ESP32_OUTPUT_GPIOS.has(gpio);
}

type SerialSignalDevice = Pick<SerialPort, "setSignals">;
type Wait = (milliseconds: number) => Promise<void>;
type SerialConnect = () => Promise<void>;

const wait: Wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function retryInitialSerialConnect(
  connect: SerialConnect,
  attempts = 20,
  delay: Wait = wait,
  update?: (message: string) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connect();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        update?.(
          "Waiting for macOS to release the CP2102. Close other serial applications if this continues.",
        );
      }
      if (attempt < attempts) await delay(500);
    }
  }
  throw new Error(
    `The CP2102 serial port stayed unavailable: ${errorMessage(lastError)}`,
  );
}

export async function runCombinedClassicReset(
  device: SerialSignalDevice,
  resetDelayMs: number,
  delay: Wait = wait,
): Promise<void> {
  await device.setSignals({ dataTerminalReady: false, requestToSend: true });
  await delay(100);
  await device.setSignals({ dataTerminalReady: true, requestToSend: false });
  await delay(resetDelayMs);
  await device.setSignals({ dataTerminalReady: false, requestToSend: false });
}

export async function runCombinedHardReset(
  device: SerialSignalDevice,
  usingUsbOtg: boolean,
  delay: Wait = wait,
): Promise<void> {
  await device.setSignals({ dataTerminalReady: false, requestToSend: true });
  await delay(usingUsbOtg ? 200 : 100);
  await device.setSignals({ dataTerminalReady: false, requestToSend: false });
  if (usingUsbOtg) await delay(200);
}

interface AuthorizedSerialPorts {
  getPorts(): Promise<SerialPort[]>;
}

type ReconnectStorage = Pick<Storage, "getItem" | "setItem">;

function isApprovedCp2102(port: SerialPort): boolean {
  const info = port.getInfo();
  return info.usbVendorId === CP2102_FILTER.usbVendorId &&
    info.usbProductId === CP2102_FILTER.usbProductId;
}

export async function automaticEsp32ReconnectAvailable(
  storage?: ReconnectStorage,
  serial?: AuthorizedSerialPorts,
): Promise<boolean> {
  if (storage) {
    try {
      if (storage.getItem(AUTOMATIC_RECONNECT_STORAGE_KEY) === "1") return true;
    } catch {
      // Storage can be unavailable in a private or restricted browser context.
    }
  }
  if (!serial) return false;
  try {
    return (await serial.getPorts()).some(isApprovedCp2102);
  } catch {
    return false;
  }
}

export function rememberAutomaticEsp32Reconnect(
  storage?: ReconnectStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(AUTOMATIC_RECONNECT_STORAGE_KEY, "1");
  } catch {
    // A successful current link remains usable even when storage is blocked.
  }
}

export function retainAutomaticReconnectEligibility(
  current: boolean,
  discovered: boolean,
): boolean {
  return current || discovered;
}

export async function reopenApprovedSerialPort(
  serial: AuthorizedSerialPorts,
  selectedPort: SerialPort,
  options: SerialOptions,
  attempts = 120,
  delay: Wait = wait,
  update?: (message: string) => void,
): Promise<SerialPort> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const approvedPorts = (await serial.getPorts()).filter(isApprovedCp2102);
    const candidate = approvedPorts.length === 1 ? approvedPorts[0]! : selectedPort;
    try {
      await candidate.open(options);
      return candidate;
    } catch (error) {
      lastError = error;
      if (attempt === 20) {
        update?.("Waiting for the CP2102 after reset. If needed, unplug and reconnect its USB cable once.");
      }
      if (attempt < attempts) await delay(500);
    }
  }
  throw new Error(`WLED serial port did not reopen after reset: ${errorMessage(lastError)}`);
}

export interface Esp32SetupPayload {
  sourceFingerprint: string;
  sourceRevision: number;
  allowLedmapUpdate?: boolean;
  config: Record<string, unknown>;
  expectedLedCount: number;
  ledmapBytes?: string;
  state: Record<string, unknown>;
  expectedEffectName?: string;
  expectedPaletteName?: string;
}

export interface SimulatorSetupOutput {
  startIndex: number;
  pixelCount: number;
  gpio: number;
}

export function isCurrentSimulatorSetup(
  payload: Esp32SetupPayload,
  currentRevision: number,
  currentFingerprint: string,
): boolean {
  return payload.sourceRevision === currentRevision &&
    payload.sourceFingerprint === currentFingerprint;
}

export function canEnableReconnectedSimulator(
  payload: Esp32SetupPayload,
  currentRevision: number,
  currentFingerprint: string,
  setupActive: boolean,
): boolean {
  return !setupActive &&
    isCurrentSimulatorSetup(payload, currentRevision, currentFingerprint);
}

export async function settleSimulatorDeviceWork(
  requests: Array<Promise<unknown> | undefined>,
): Promise<void> {
  await Promise.allSettled(
    requests.filter((request): request is Promise<unknown> => request !== undefined),
  );
}

export function createSimulatorSetupConfig(
  source: Record<string, unknown>,
  outputs: readonly SimulatorSetupOutput[],
  colorOrder: number,
  pixelsPerFixture = 64,
): Record<string, unknown> {
  const ledCount = outputs.reduce((sum, output) => sum + output.pixelCount, 0);
  const gpioSet = new Set(outputs.map((output) => output.gpio));
  if (
    outputs.length < 1 ||
    outputs.length > 4 ||
    !Number.isInteger(pixelsPerFixture) ||
    pixelsPerFixture < 1 ||
    ledCount < pixelsPerFixture ||
    ledCount > 2_624 ||
    ledCount % pixelsPerFixture !== 0 ||
    ledCount / pixelsPerFixture > 41 ||
    gpioSet.size !== outputs.length ||
    outputs.some((output, index) =>
      !Number.isInteger(output.startIndex) ||
      !Number.isInteger(output.pixelCount) ||
      output.pixelCount < pixelsPerFixture ||
      output.pixelCount % pixelsPerFixture !== 0 ||
      output.startIndex !== outputs
        .slice(0, index)
        .reduce((sum, prior) => sum + prior.pixelCount, 0) ||
      !isApprovedEsp32OutputGpio(output.gpio)
    ) ||
    !Number.isInteger(colorOrder) ||
    colorOrder < 0 ||
    colorOrder > 5
  ) {
    throw new Error(
      "ESP32 setup requires 1 through 41 complete fixtures on one through four contiguous approved GPIO outputs and a WLED color order.",
    );
  }
  const config = structuredClone(source);
  const led = (config.hw as { led?: {
    total?: number;
    maxpwr?: number;
    ins?: Array<Record<string, unknown>>;
  } } | undefined)?.led;
  const template = led?.ins?.[0];
  if (!led || !template) {
    throw new Error("The approved ESP32 setup template has no LED bus.");
  }
  const completeAuthority = pixelsPerFixture === 64 &&
    ledCount === 2_624 && outputs.length === 4;
  const maximumCurrentMa = completeAuthority
    ? 0
    : Math.round(ledCount / 64 * 1_000);
  led.total = ledCount;
  led.maxpwr = maximumCurrentMa;
  led.ins = outputs.map((output) => ({
    ...template,
    start: output.startIndex,
    len: output.pixelCount,
    pin: [output.gpio],
    order: colorOrder,
    maxpwr: completeAuthority
      ? 14_000
      : Math.round(output.pixelCount / 64 * 1_000),
  }));
  config.def = { ps: STANDALONE_PRESET_ID, on: true, bri: 128 };
  config.if = {
    live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true },
  };
  return config;
}

export interface Esp32SetupControllerOptions {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  runButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  ssidInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  firmwareInput: HTMLInputElement;
  progressElement: HTMLProgressElement;
  progressLabel: HTMLOutputElement;
  bootInstruction: HTMLOutputElement;
  clearSetupLog(): void;
  setLogMessage(message: string, error?: boolean): void;
  getPayload(): Esp32SetupPayload;
  onSetupActiveChange?(active: boolean): void | Promise<void>;
  onSetupComplete?(deviceUrl: URL, payload: Esp32SetupPayload): void;
}

interface FirmwareStatus {
  available: boolean;
  artifact: typeof firmwareReceipt.fullFlashArtifact;
}

interface ImprovWifiProvisioner {
  scan(timeout?: number): Promise<Array<{ name: string; rssi: number }>>;
  provision(ssid: string, password: string, timeout?: number): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function provisionVisibleWifi(
  improv: ImprovWifiProvisioner,
  ssid: string,
  password: string,
  update: (message: string) => void,
  scanAttempts = 6,
  delay: Wait = wait,
): Promise<void> {
  let network: { name: string; rssi: number } | undefined;
  let lastScanError: unknown;
  let completedScan = false;
  for (let attempt = 1; attempt <= scanAttempts; attempt += 1) {
    update(`Scanning for the 2.4 GHz network ${ssid} (${attempt}/${scanAttempts}).`);
    try {
      const networks = await improv.scan(15_000);
      completedScan = true;
      network = networks.find((candidate) => candidate.name === ssid);
      if (network) break;
      if (attempt < scanAttempts) {
        update(
          `${ssid} was not visible; the ESP32 found ${networks.length} other network${networks.length === 1 ? "" : "s"}. Retrying.`,
        );
      }
    } catch (error) {
      lastScanError = error;
      if (attempt < scanAttempts) {
        update(`The ESP32 Wi-Fi scan did not answer. Retrying (${attempt}/${scanAttempts}).`);
      }
    }
    if (attempt < scanAttempts) await delay(2_000);
  }
  if (!network) {
    if (!completedScan) {
      throw new Error(`ESP32 Wi-Fi scan failed: ${errorMessage(lastScanError)}`);
    }
    throw new Error(`The ESP32 cannot see the 2.4 GHz network ${ssid}.`);
  }
  update(`Wi-Fi network ${ssid} is visible at ${network.rssi} dBm.`);
  update("Sending Wi-Fi credentials to WLED. Waiting up to 60 seconds.");
  try {
    await improv.provision(ssid, password, 60_000);
  } catch (error) {
    const detail = errorMessage(error);
    if (detail === "TIMEOUT") {
      throw new Error(
        `WLED did not connect to ${ssid} within 60 seconds. Check the 2.4 GHz password and signal.`,
      );
    }
    throw new Error(`WLED Wi-Fi provisioning failed: ${detail}`);
  }
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

export function parseWledPresetJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const normalized = text.replace(/^(\{\s*),/, "$1");
    if (normalized === text) {
      throw new Error("WLED preset read-back returned invalid JSON.");
    }
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      throw new Error("WLED preset read-back returned invalid JSON.");
    }
  }
}

async function readWledPresetResponse(response: Response, context: string): Promise<unknown> {
  const value = parseWledPresetJson(await response.text());
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
  if (!/^(?:ESP32|ESP32-D0WDQ6(?: \(revision \d+\))?)$/.test(chipName)) {
    throw new Error(`Expected the approved classic ESP32, but detected ${chipName}.`);
  }
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
  const target = new URL(path, baseUrl);
  const proxy = new URL(
    "/api/esp32-device",
    globalThis.location?.origin ?? "http://localhost",
  );
  proxy.searchParams.set("address", target.hostname);
  proxy.searchParams.set("path", `${target.pathname}${target.search}`);
  const headers = new Headers(init?.headers);
  headers.set("X-LOO-UME-ESP32", "1");
  return fetch(proxy, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function waitForWledInfo(
  baseUrl: URL,
  timeoutMs = 45_000,
): Promise<{ mac?: unknown }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await readJsonResponse(
        await deviceFetch(baseUrl, "/json/info", undefined, 12_000),
        "WLED identity",
      ) as { mac?: unknown };
    } catch (error) {
      lastError = error;
    }
    await wait(1_000);
  }
  throw new Error(`WLED HTTP did not become ready: ${errorMessage(lastError)}`);
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

function rgbFramebufferBytes(
  pixels: readonly [number, number, number][],
): Uint8Array {
  if (pixels.length < 1 || pixels.length > 2_624 || pixels.some((pixel) =>
    pixel.length !== 3 || pixel.some((channel) =>
      !Number.isInteger(channel) || channel < 0 || channel > 255
    )
  )) {
    throw new Error("The simulator hardware preview must contain from 1 through 2,624 RGB pixels.");
  }
  return Uint8Array.from(
    pixels.flatMap((pixel) => pixel.map((channel) =>
      Math.floor((channel / 255) ** WLED_COLOR_GAMMA * 255 + 0.5)
    )),
  );
}

export function mappedPanelFramebuffer(
  pixels: Uint32Array,
  entries: readonly { logicalIndex: number; physicalIndex: number }[],
  physicalStartIndex: number,
  expectedLedCount = 64,
): Array<[number, number, number]> {
  const panelEntries = entries
    .filter((entry) =>
      entry.physicalIndex >= physicalStartIndex &&
      entry.physicalIndex < physicalStartIndex + expectedLedCount
    )
    .sort((first, second) => first.physicalIndex - second.physicalIndex);
  if (
    panelEntries.length !== expectedLedCount ||
    panelEntries.some((entry, offset) =>
      entry.physicalIndex !== physicalStartIndex + offset ||
      !Number.isInteger(entry.logicalIndex) ||
      entry.logicalIndex < 0 ||
      entry.logicalIndex >= pixels.length
    )
  ) {
    throw new Error("The loaded simulator does not contain one contiguous mapped output.");
  }
  return panelEntries.map((entry) => {
    const packed = pixels[entry.logicalIndex] ?? 0;
    return [
      (packed >> 16) & 0xff,
      (packed >> 8) & 0xff,
      packed & 0xff,
    ];
  });
}

export async function sendSimulatorFramebuffer(
  baseUrl: URL,
  pixels: readonly [number, number, number][],
  signal?: AbortSignal,
): Promise<void> {
  const proxy = new URL(
    "/api/esp32-frame",
    globalThis.location?.origin ?? "http://localhost",
  );
  proxy.searchParams.set("address", baseUrl.hostname);
  const response = await fetch(proxy, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-LOO-UME-ESP32": "1",
    },
    body: rgbFramebufferBytes(pixels).slice().buffer as ArrayBuffer,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(2_000)])
      : AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    throw new Error(`WLED realtime preview failed with HTTP ${response.status}.`);
  }
}

export async function resolveVerifiedWledAddress(expectedMac: string): Promise<URL> {
  const mdnsUrl = new URL(`http://${SETUP_HOSTNAME}.local/`);
  const mdnsInfo = await readJsonResponse(
    await deviceFetch(mdnsUrl, "/json/info", undefined, 12_000),
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
    await deviceFetch(currentUrl, "/json/info", undefined, 12_000),
    "WLED IP discovery",
  ) as { ip?: unknown; mac?: unknown };
  if (currentInfo.mac !== expectedMac || currentInfo.ip !== currentUrl.hostname) {
    throw new Error("The current WLED IP address does not match the expected device.");
  }
  return currentUrl;
}

interface ExistingSimulatorConnectOptions {
  discoveryAttempts?: number;
  delay?: Wait;
  shouldContinue?: () => boolean;
  update?: (message: string) => void;
  persist?: typeof persistStandaloneAnimation;
}

export async function retryExistingSimulatorDiscovery<T>(
  discover: () => Promise<T>,
  attempts = 12,
  delay: Wait = wait,
  shouldContinue: () => boolean = () => true,
  update?: (message: string) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!shouldContinue()) throw new Error("Automatic ESP32 reconnect was cancelled.");
    update?.(`Checking loo-ume.local for the configured ESP32 (${attempt}/${attempts}).`);
    try {
      return await discover();
    } catch (error) {
      lastError = error;
      update?.(
        `ESP32 discovery failed (${attempt}/${attempts}): ${errorMessage(error)}${
          attempt < attempts ? " Retrying in 2 seconds." : ""
        }`,
      );
      if (attempt < attempts) {
        if (!shouldContinue()) throw new Error("Automatic ESP32 reconnect was cancelled.");
        await delay(2_000);
      }
    }
  }
  throw new Error(`Automatic ESP32 discovery failed: ${errorMessage(lastError)}`);
}

export async function connectExistingSimulatorDevice(
  payload: Esp32SetupPayload,
  options: ExistingSimulatorConnectOptions = {},
): Promise<URL> {
  assertBoundedSimulatorPayload(payload);
  const shouldContinue = options.shouldContinue ?? (() => true);
  const mdnsUrl = new URL(`http://${SETUP_HOSTNAME}.local/`);
  const mdnsInfo = await retryExistingSimulatorDiscovery(
    async () => readJsonResponse(
      await deviceFetch(mdnsUrl, "/json/info", undefined, 12_000),
      "WLED mDNS discovery",
    ) as Promise<{ arch?: unknown; ip?: unknown; leds?: { count?: unknown }; mac?: unknown }>,
    options.discoveryAttempts,
    options.delay,
    shouldContinue,
    options.update,
  );
  if (
    mdnsInfo.arch !== "esp32" ||
    typeof mdnsInfo.ip !== "string" ||
    typeof mdnsInfo.mac !== "string" ||
    mdnsInfo.leds?.count !== payload.expectedLedCount
  ) {
    throw new Error("The existing WLED device does not match the loaded simulator setup.");
  }
  const currentUrl = privateDeviceUrl(`http://${mdnsInfo.ip}/`);
  options.update?.(`Found the configured ESP32 at ${currentUrl.hostname}. Verifying its loaded-project contract.`);
  const [currentInfo, configuration] = await Promise.all([
    readJsonResponse(
      await deviceFetch(currentUrl, "/json/info", undefined, 12_000),
      "WLED IP discovery",
    ) as Promise<{ arch?: unknown; ip?: unknown; leds?: { count?: unknown }; mac?: unknown }>,
    readJsonResponse(
      await deviceFetch(currentUrl, "/json/cfg", undefined, 12_000),
      "WLED config read-back",
    ),
  ]);
  if (
    currentInfo.arch !== "esp32" ||
    currentInfo.ip !== currentUrl.hostname ||
    currentInfo.mac !== mdnsInfo.mac ||
    currentInfo.leds?.count !== payload.expectedLedCount
  ) {
    throw new Error("The existing WLED address does not match the verified device.");
  }
  assertConfigReadback(configuration, payload);
  if (payload.ledmapBytes !== undefined) {
    if (!shouldContinue()) throw new Error("Automatic ESP32 reconnect was cancelled.");
    await synchronizeDeviceLedmap(
      currentUrl,
      payload.ledmapBytes,
      payload.allowLedmapUpdate === true,
      shouldContinue,
      options.update,
    );
  }
  if (!shouldContinue()) throw new Error("Automatic ESP32 reconnect was cancelled.");
  options.update?.("ESP32 contract matched. Syncing the current animation preset.");
  await (options.persist ?? persistStandaloneAnimation)(
    currentUrl,
    payload,
    shouldContinue,
    options.update,
  );
  return currentUrl;
}

export function assertLedmapReadback(
  actualBytes: string,
  expectedBytes: string,
  message = "WLED ledmap read-back does not match the deployment artifact.",
): void {
  let actual: unknown;
  let expected: unknown;
  try {
    actual = JSON.parse(actualBytes) as unknown;
    expected = JSON.parse(expectedBytes) as unknown;
  } catch {
    throw new Error("WLED ledmap read-back returned invalid JSON.");
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

async function readAndAssertLedmap(
  baseUrl: URL,
  expectedBytes: string,
  mismatchMessage?: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<void> {
  const readback = await deviceFetch(
    baseUrl,
    "/edit?func=edit&path=/ledmap.json",
    undefined,
    timeoutMs,
  );
  if (!readback.ok) {
    throw new Error(`WLED ledmap read-back failed with HTTP ${readback.status}.`);
  }
  assertLedmapReadback(await readback.text(), expectedBytes, mismatchMessage);
}

async function uploadLedmap(baseUrl: URL, ledmapBytes: string): Promise<void> {
  const data = new FormData();
  data.append(
    "data",
    new Blob([ledmapBytes], { type: "application/json" }),
    "ledmap.json",
  );
  const upload = await deviceFetch(baseUrl, "/upload", {
    method: "POST",
    body: data,
  });
  if (!upload.ok) {
    throw new Error(`WLED ledmap upload failed with HTTP ${upload.status}.`);
  }
}

export async function synchronizeDeviceLedmap(
  baseUrl: URL,
  expectedBytes: string,
  allowUpdate = false,
  shouldContinue: () => boolean = () => true,
  update?: (message: string) => void,
): Promise<boolean> {
  const current = await deviceFetch(
    baseUrl,
    "/edit?func=edit&path=/ledmap.json",
  );
  if (!current.ok) {
    throw new Error(`WLED ledmap read-back failed with HTTP ${current.status}.`);
  }
  let storedMatches = true;
  try {
    assertLedmapReadback(
      await current.text(),
      expectedBytes,
      "The existing WLED ledmap does not match the loaded simulator.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "WLED ledmap read-back returned invalid JSON."
    ) {
      throw error;
    }
    if (!allowUpdate) throw error;
    storedMatches = false;
  }

  if (!shouldContinue()) {
    throw new Error("Automatic ESP32 reconnect was cancelled.");
  }
  if (!storedMatches) {
    update?.("Panel poses changed. Updating the ESP32 spatial ledmap.");
    await uploadLedmap(baseUrl, expectedBytes);
  }
  if (!shouldContinue()) throw new Error("Automatic ESP32 reconnect was cancelled.");
  let activeState: { ledmap?: unknown };
  if (!storedMatches || allowUpdate) {
    await postDeviceJson(baseUrl, "/json/state", { ledmap: 0 });
    activeState = await readJsonResponse(
      await deviceFetch(baseUrl, "/json/state"),
      "WLED active ledmap read-back",
    ) as { ledmap?: unknown };
  } else {
    activeState = await readJsonResponse(
      await deviceFetch(baseUrl, "/json/state"),
      "WLED active ledmap read-back",
    ) as { ledmap?: unknown };
    if (activeState.ledmap !== 0) {
      await postDeviceJson(baseUrl, "/json/state", { ledmap: 0 });
      activeState = await readJsonResponse(
        await deviceFetch(baseUrl, "/json/state"),
        "WLED active ledmap read-back",
      ) as { ledmap?: unknown };
    }
  }
  if (activeState.ledmap !== 0) {
    throw new Error("WLED did not activate the updated spatial ledmap.");
  }
  if (!storedMatches || allowUpdate) {
    await readAndAssertLedmap(baseUrl, expectedBytes);
  }
  if (!storedMatches) update?.("ESP32 spatial ledmap updated and activated.");
  return !storedMatches;
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
  const initialInfo = await waitForWledInfo(baseUrl);
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
    def?: Record<string, unknown>;
    hw?: { led?: { total?: unknown; maxpwr?: unknown; ins?: unknown[] } };
    if?: { live?: Record<string, unknown> };
  };
  const expectedLed = (payload.config.hw as {
    led?: { maxpwr?: unknown };
  } | undefined)?.led;
  const expected = expectedBuses(payload.config) as Array<Record<string, unknown>>;
  const actual = config.hw?.led?.ins;
  const expectedDefault = payload.config.def as Record<string, unknown> | undefined;
  const expectedLive = (payload.config.if as { live?: Record<string, unknown> } | undefined)?.live;
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
    (expectedDefault && Object.entries(expectedDefault).some(([key, value]) =>
      config.def?.[key] !== value
    )) ||
    (expectedLive && Object.entries(expectedLive).some(([key, value]) =>
      config.if?.live?.[key] !== value
    )) ||
    config.hw?.led?.total !== payload.expectedLedCount ||
    (expectedLed?.maxpwr !== undefined &&
      config.hw?.led?.maxpwr !== expectedLed.maxpwr) ||
    !busesMatch
  ) {
    throw new Error("WLED configuration read-back does not match the selected setup.");
  }
}

function standalonePresetState(payload: Esp32SetupPayload): Record<string, unknown> {
  const state = structuredClone(payload.state);
  delete state.o;
  delete state.bootps;
  return {
    ...state,
    live: false,
    psave: STANDALONE_PRESET_ID,
    n: "LOO/UME standalone",
    ib: true,
    sb: true,
  };
}

export function assertStandalonePresetReadback(
  input: unknown,
  payload: Esp32SetupPayload,
): void {
  if (typeof input !== "object" || input === null) {
    throw new Error("WLED preset read-back is invalid.");
  }
  const preset = (input as Record<string, unknown>)[String(STANDALONE_PRESET_ID)] as
    Record<string, unknown> | undefined;
  const expectedSegment = payload.state.seg as Record<string, unknown> | undefined;
  const storedSegments = Array.isArray(preset?.seg)
    ? preset.seg
    : [preset?.seg];
  const actualSegment = storedSegments[0] as Record<string, unknown> | undefined;
  const inactiveTrailingSegments = storedSegments.slice(1).every((segment) =>
    typeof segment === "object" && segment !== null &&
    (segment as Record<string, unknown>).stop === 0
  );
  const keys = ["start", "stop", "fx", "pal", "sx", "ix", "frz", "col"] as const;
  if (
    preset?.n !== "LOO/UME standalone" ||
    preset.on !== payload.state.on ||
    preset.bri !== payload.state.bri ||
    !actualSegment ||
    !inactiveTrailingSegments ||
    keys.some((key) =>
      JSON.stringify(actualSegment[key]) !== JSON.stringify(expectedSegment?.[key])
    )
  ) {
    throw new Error("WLED standalone preset does not match the simulator settings.");
  }
}

export async function persistStandaloneAnimation(
  baseUrl: URL,
  payload: Esp32SetupPayload,
  shouldContinue: () => boolean = () => true,
  update?: (message: string) => void,
): Promise<void> {
  assertBoundedSimulatorPayload(payload);
  if (!shouldContinue()) throw new Error("Standalone animation save was cancelled.");
  const [effects, palettes] = await Promise.all([
    readJsonResponse(await deviceFetch(baseUrl, "/json/eff"), "WLED effect list"),
    readJsonResponse(await deviceFetch(baseUrl, "/json/pal"), "WLED palette list"),
  ]);
  remapStateToLiveTables(payload, effects, palettes);
  if (!shouldContinue()) throw new Error("Standalone animation save was cancelled.");
  let stateWriteError: unknown;
  try {
    await postDeviceJson(baseUrl, "/json/state", standalonePresetState(payload));
  } catch (error) {
    stateWriteError = error;
    update?.(
      `WLED state-write response was lost: ${errorMessage(error)} Verifying the exact saved state before retrying any mutation.`,
    );
  }
  const deadline = Date.now() + PRESET_PERSISTENCE_DEADLINE_MS;
  let lastError: unknown = stateWriteError;
  let attempt = 0;
  while (deadline - Date.now() >= RESTART_VERIFICATION_MINIMUM_WINDOW_MS) {
    if (!shouldContinue()) throw new Error("Standalone animation save was cancelled.");
    attempt += 1;
    try {
      const timeoutMs = Math.min(
        RESTART_VERIFICATION_REQUEST_TIMEOUT_MS,
        deadline - Date.now(),
      );
      const presetRequest = deviceFetch(baseUrl, "/presets.json", undefined, timeoutMs)
        .then((response) => readWledPresetResponse(response, "WLED preset read-back"));
      const informationRequest = deviceFetch(baseUrl, "/json/info", undefined, timeoutMs)
        .then((response) => readJsonResponse(response, "WLED boot preset read-back"));
      const [presetResult, informationResult] = await Promise.allSettled([
        presetRequest,
        informationRequest,
      ]);
      if (presetResult.status === "rejected") throw presetResult.reason;
      if (informationResult.status === "rejected") throw informationResult.reason;
      const presets = presetResult.value;
      const information = informationResult.value;
      assertStandalonePresetReadback(presets, payload);
    const info = information as { leds?: { bootps?: unknown } };
      if (info.leds?.bootps !== STANDALONE_PRESET_ID) {
        throw new Error("WLED did not select the standalone animation as its boot preset.");
      }
      return;
    } catch (error) {
      lastError = error;
      update?.(
        `Standalone preset is not ready (${attempt}): ${errorMessage(error)} Retrying.`,
      );
      if (!shouldContinue()) throw new Error("Standalone animation save was cancelled.");
      const remainingMs = deadline - Date.now();
      if (remainingMs >= RESTART_VERIFICATION_MINIMUM_WINDOW_MS) {
        await wait(Math.min(250, remainingMs));
      }
    }
  }
  throw new Error(
    `WLED standalone preset did not stabilize within ${PRESET_PERSISTENCE_DEADLINE_MS / 1_000} seconds: ${errorMessage(lastError)}`,
  );
}

function assertBoundedSimulatorPayload(payload: Esp32SetupPayload): void {
  if (
    typeof payload.sourceFingerprint !== "string" ||
    payload.sourceFingerprint.length === 0 ||
    !Number.isInteger(payload.sourceRevision) ||
    !Number.isInteger(payload.expectedLedCount) ||
    payload.expectedLedCount < 1 ||
    payload.expectedLedCount > 2_624
  ) {
    throw new Error("ESP32 setup supports the loaded simulator only from 1 through 2,624 LEDs.");
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
  const keys = ["start", "stop", "fx", "pal", "sx", "ix", "frz"] as const;
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

export function assertStandaloneStateReadback(
  input: unknown,
  payload: Esp32SetupPayload,
): void {
  assertStateReadback(input, payload);
  const expectedSegment = payload.state.seg as Record<string, unknown> | undefined;
  const actual = input as {
    ps?: unknown;
    seg?: Array<Record<string, unknown>>;
  };
  if (
    actual.ps !== STANDALONE_PRESET_ID ||
    JSON.stringify(actual.seg?.[0]?.col) !== JSON.stringify(expectedSegment?.col)
  ) {
    throw new Error("WLED did not restore the complete standalone preset state.");
  }
}

export async function verifyRestartedDevice(
  baseUrl: URL,
  payload: Esp32SetupPayload,
  expectedMac: string,
  update: (message: string) => void,
): Promise<void> {
  const deadline = Date.now() + RESTART_VERIFICATION_DEADLINE_MS;
  let lastError: unknown;
  let attempt = 0;
  while (deadline - Date.now() >= RESTART_VERIFICATION_MINIMUM_WINDOW_MS) {
    attempt += 1;
    try {
      const requestTimeoutMs = Math.min(
        RESTART_VERIFICATION_REQUEST_TIMEOUT_MS,
        deadline - Date.now(),
      );
      const restartedConfigRequest = deviceFetch(
        baseUrl, "/json/cfg", undefined, requestTimeoutMs,
      )
        .then((response) => readJsonResponse(response, "WLED restarted config read-back"));
      const restartedInfoRequest = deviceFetch(
        baseUrl, "/json/info", undefined, requestTimeoutMs,
      )
        .then((response) => readJsonResponse(response, "WLED restarted firmware read-back"));
      const restartedStateRequest = deviceFetch(
        baseUrl, "/json/state", undefined, requestTimeoutMs,
      )
        .then((response) => readJsonResponse(response, "WLED restarted state read-back"));
      const restartedPresetRequest = deviceFetch(
        baseUrl, "/presets.json", undefined, requestTimeoutMs,
      )
        .then((response) =>
          readWledPresetResponse(response, "WLED restarted preset read-back")
        );
      const restartedLedmapRequest = payload.ledmapBytes === undefined
        ? Promise.resolve()
        : readAndAssertLedmap(baseUrl, payload.ledmapBytes, undefined, requestTimeoutMs);
      const results = await Promise.allSettled([
        restartedConfigRequest,
        restartedInfoRequest,
        restartedStateRequest,
        restartedPresetRequest,
        restartedLedmapRequest,
      ]);
      const rejection = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (rejection) throw rejection.reason;
      const [configuration, information, state, presets] = results.map((result) =>
        (result as PromiseFulfilledResult<unknown>).value
      );
      assertConfigReadback(configuration, payload);
      assertStandaloneStateReadback(state, payload);
      assertStandalonePresetReadback(presets, payload);
      const restarted = information as {
        arch?: unknown;
        leds?: { bootps?: unknown; count?: unknown };
        mac?: unknown;
      };
      if (
        restarted.arch !== "esp32" ||
        restarted.mac !== expectedMac ||
        restarted.leds?.count !== payload.expectedLedCount ||
        restarted.leds?.bootps !== STANDALONE_PRESET_ID
      ) {
        throw new Error("WLED standalone playback did not survive restart.");
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        update("WLED HTTP is still restarting. Retrying the complete read-back.");
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) await wait(Math.min(500, remainingMs));
    }
  }
  throw new Error(`WLED restarted verification did not stabilize: ${errorMessage(lastError)}`);
}

export async function applyAndVerifyDevice(
  baseUrl: URL,
  payload: Esp32SetupPayload,
  update: (message: string) => void,
): Promise<URL> {
  update(`Applying the loaded ${payload.expectedLedCount}-LED simulator configuration.`);
  const config = structuredClone(payload.config);
  config.id = { mdns: SETUP_HOSTNAME, name: "LOO/UME" };
  await postDeviceJson(baseUrl, "/json/cfg", config);

  if (payload.ledmapBytes !== undefined) {
    await uploadLedmap(baseUrl, payload.ledmapBytes);
    await readAndAssertLedmap(baseUrl, payload.ledmapBytes);
  }

  await persistStandaloneAnimation(baseUrl, payload);
  const [configuration, information, state] = await Promise.all([
    readJsonResponse(await deviceFetch(baseUrl, "/json/cfg"), "WLED config read-back"),
    readJsonResponse(await deviceFetch(baseUrl, "/json/info"), "WLED firmware read-back"),
    readJsonResponse(await deviceFetch(baseUrl, "/json/state"), "WLED state read-back"),
  ]);
  assertConfigReadback(configuration, payload);
  assertStateReadback(state, payload);
  const info = information as { arch?: unknown; leds?: { count?: unknown }; mac?: unknown };
  if (info.arch !== "esp32" || info.leds?.count !== payload.expectedLedCount) {
    throw new Error("The live WLED target or LED count does not match the setup.");
  }
  if (typeof info.mac !== "string") {
    throw new Error("WLED did not report a device MAC address before the boot-preset test.");
  }

  update("Restarting WLED to prove standalone playback.");
  const reset = await deviceFetch(baseUrl, "/reset");
  if (!reset.ok) throw new Error(`WLED restart failed with HTTP ${reset.status}.`);
  const restartedUrl = await discoverRestartedDevice(info.mac);
  await verifyRestartedDevice(restartedUrl, payload, info.mac, update);
  return restartedUrl;
}

async function openImprov(
  port: SerialPort,
  serial: AuthorizedSerialPorts,
  update: (message: string) => void,
): Promise<{
  improv: InstanceType<
    typeof import("improv-wifi-serial-sdk/dist/serial.js")["ImprovSerial"]
  >;
  port: SerialPort;
}> {
  await wait(2_000);
  const activePort = await reopenApprovedSerialPort(
    serial,
    port,
    { baudRate: 115200 },
    120,
    wait,
    update,
  );
  let improv: InstanceType<
    typeof import("improv-wifi-serial-sdk/dist/serial.js")["ImprovSerial"]
  > | undefined;
  try {
    const { ImprovSerial } = await import("improv-wifi-serial-sdk/dist/serial.js");
    improv = new ImprovSerial(activePort, { log() {}, error() {}, debug() {} });
    await improv.initialize(15_000);
    assertApprovedImprovIdentity(improv.info);
    update("Improv verified WLED on the approved ESP32.");
    return { improv, port: activePort };
  } catch (error) {
    if (improv) await improv.close().catch(() => undefined);
    if (activePort.readable || activePort.writable) {
      await activePort.close().catch(() => undefined);
    }
    throw error;
  }
}

async function runSetup(
  options: Esp32SetupControllerOptions,
): Promise<{ deviceUrl: URL; payload: Esp32SetupPayload }> {
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
  options.setLogMessage("Verifying the approved complete ESP32 image.");
  options.progressLabel.value = "Verifying image";
  const firmware = await loadFirmware(options.firmwareInput.files?.[0]);
  const payload = options.getPayload();
  assertBoundedSimulatorPayload(payload);
  if (!("serial" in navigator)) {
    throw new Error("This browser does not support Web Serial. Use Chrome or Edge.");
  }
  const serial = navigator.serial;
  options.setLogMessage("Select the Silicon Labs CP2102 USB serial device.");
  options.setLogMessage("Keep only this ESP32/CP2102 connected until setup completes.");
  options.progressLabel.value = "Select CP2102";
  options.bootInstruction.value = "HOLD BOOT";
  options.bootInstruction.dataset.state = "hold";
  const port = await serial.requestPort({ filters: [CP2102_FILTER] });
  let activePort = port;
  assertApprovedSerialDevice(port.getInfo());

  const { ClassicReset, ESPLoader, HardReset, Transport } = await import("esptool-js");
  const transport = new Transport(port, false);
  const connectTransport = transport.connect.bind(transport);
  transport.connect = (...arguments_) => retryInitialSerialConnect(
    () => connectTransport(...arguments_),
    20,
    wait,
    options.setLogMessage,
  );
  const loader = new ESPLoader({
    transport,
    baudrate: ESP32_FLASH_BAUD_RATE,
    resetConstructors: {
      classicReset(resetTransport, resetDelayMs) {
        const strategy = new ClassicReset(resetTransport, resetDelayMs);
        strategy.reset = () =>
          runCombinedClassicReset(resetTransport.device, resetDelayMs);
        return strategy;
      },
      hardReset(resetTransport, usingUsbOtg = false) {
        const strategy = new HardReset(resetTransport, usingUsbOtg);
        strategy.reset = () =>
          runCombinedHardReset(resetTransport.device, usingUsbOtg);
        return strategy;
      },
    },
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
  let improv: InstanceType<
    typeof import("improv-wifi-serial-sdk/dist/serial.js")["ImprovSerial"]
  > | undefined;
  try {
    const chipName = await loader.main();
    assertApprovedEsp32Chip(chipName);
    options.bootInstruction.value = "RELEASE BOOT";
    options.bootInstruction.dataset.state = "release";
    options.setLogMessage("ESP32 synchronized. Release BOOT now.");
    let lastLoggedPercent = -5;
    await loader.writeFlash(createEsp32FlashOptions(
      firmware,
      (_fileIndex, written, total) => {
        const percent = total === 0 ? 0 : Math.floor(written / total * 100);
        options.progressElement.value = percent;
        options.progressLabel.value = `${percent}%`;
        if (percent === 100 || percent >= lastLoggedPercent + 5) {
          lastLoggedPercent = percent;
          options.setLogMessage(`Flashing approved WLED image: ${percent}%.`);
        }
      },
    ));
    options.progressElement.value = 100;
    options.progressLabel.value = "Flash verified";
    await loader.after("hard_reset");
    await transport.disconnect();

    options.setLogMessage("Provisioning Wi-Fi over USB. Credentials stay only in this page.");
    options.progressLabel.value = "Provisioning Wi-Fi";
    const improvConnection = await openImprov(port, serial, options.setLogMessage);
    activePort = improvConnection.port;
    improv = improvConnection.improv;
    await provisionVisibleWifi(
      improv,
      ssid,
      options.passwordInput.value,
      options.setLogMessage,
    );
    if (!improv.nextUrl) throw new Error("WLED did not return its local network address.");
    let deviceUrl = privateDeviceUrl(improv.nextUrl);
    options.setLogMessage(`WLED joined Wi-Fi at ${deviceUrl.host}. Waiting for HTTP.`);
    await improv.close();
    improv = undefined;
    await activePort.close();

    options.setLogMessage(`Verifying ${SETUP_HOSTNAME}.local after restart.`);
    options.progressLabel.value = "Verifying WLED";
    deviceUrl = await setAndVerifyDeviceIdentity(deviceUrl);
    deviceUrl = await applyAndVerifyDevice(deviceUrl, payload, options.setLogMessage);
    options.setLogMessage(
      `ESP32 setup verified at ${deviceUrl.host}. ${SETUP_HOSTNAME}.local resolves to this device.`,
    );
    options.progressLabel.value = "Setup complete";
    options.bootInstruction.value = "BOOT RELEASED";
    options.bootInstruction.dataset.state = "complete";
    return { deviceUrl, payload };
  } finally {
    options.passwordInput.value = "";
    if (improv) await improv.close().catch(() => undefined);
    await transport.disconnect().catch(() => undefined);
    if (activePort.readable || activePort.writable) {
      await activePort.close().catch(() => undefined);
    }
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
    options.clearSetupLog();
    options.runButton.disabled = true;
    options.progressElement.value = 0;
    options.progressLabel.value = "Preparing";
    options.bootInstruction.value = "HOLD BOOT";
    options.bootInstruction.dataset.state = "hold";
    void Promise.resolve(options.onSetupActiveChange?.(true))
      .then(() => runSetup(options))
      .then(({ deviceUrl, payload }) => {
        options.onSetupComplete?.(deviceUrl, payload);
        options.dialog.close();
      })
      .catch((error) => {
        options.progressLabel.value = "Setup stopped";
        options.setLogMessage(errorMessage(error), true);
      })
      .finally(async () => {
        await options.onSetupActiveChange?.(false);
        clearPassword();
        options.runButton.disabled = false;
      });
  });
}
