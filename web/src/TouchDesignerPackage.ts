import { createWledDeploymentBundle } from "../../src/wled/DeploymentContract.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";

const encoder = new TextEncoder();
const DDP_PORT = 4048;
const DDP_CHANNELS_PER_PACKET = 1_440;
const DEFAULT_FRAME_RATE = 30;

export interface TouchDesignerPackageOptions {
  targetAddress?: string;
}

export interface TouchDesignerPixelSample {
  logicalIndex: number;
  u: number;
  v: number;
}

export interface TouchDesignerConfig {
  schemaVersion: "1.0.0";
  generator: "loo-ume-touchdesigner-ddp";
  sourceTop: "/project1/loo_ume_source";
  statusDat: "/project1/loo_ume_status";
  inputProjection: "equirectangular-2:1";
  addressOrder: "logical-effect-order";
  wledLedmapApplications: 1;
  target: {
    address: string;
    port: typeof DDP_PORT;
    status: "verified-runtime" | "saved-mdns-default";
  };
  mappingFingerprint: string;
  mappingFingerprintVersion: HardwareMappingContract["fingerprintVersion"];
  deploymentIdentity: string;
  pixelCount: number;
  frameRate: typeof DEFAULT_FRAME_RATE;
  channelsPerPacket: typeof DDP_CHANNELS_PER_PACKET;
  replacedFramePolicy: "keep-latest-complete-frame";
  outputColorChannels: "RGB";
  panelColorOrder: HardwareMappingContract["wledColorOrder"];
  pixels: TouchDesignerPixelSample[];
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2) + "\n");
}

function validTargetAddress(value: string): boolean {
  if (value === "loo-ume.local") return true;
  const parts = value.split(".").map(Number);
  return parts.length === 4 && parts.every((part) =>
    Number.isInteger(part) && part >= 0 && part <= 255
  ) && (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function createTouchDesignerConfig(
  contract: HardwareMappingContract,
  sculptureBytes: string,
  options: TouchDesignerPackageOptions = {},
): TouchDesignerConfig {
  if (!contract.readiness.mappingReady) {
    throw new Error("TouchDesigner output requires a current mapping-ready address contract.");
  }
  const targetAddress = options.targetAddress ?? "loo-ume.local";
  if (!validTargetAddress(targetAddress)) {
    throw new Error("TouchDesigner output requires the saved mDNS name or a private IPv4 address.");
  }
  const entries = [...contract.mapping.entries]
    .sort((first, second) => first.logicalIndex - second.logicalIndex);
  if (entries.some((entry, index) => entry.logicalIndex !== index)) {
    throw new Error("TouchDesigner output requires complete logical LED indices from zero.");
  }
  const deployment = createWledDeploymentBundle(contract, sculptureBytes);
  return {
    schemaVersion: "1.0.0",
    generator: "loo-ume-touchdesigner-ddp",
    sourceTop: "/project1/loo_ume_source",
    statusDat: "/project1/loo_ume_status",
    inputProjection: "equirectangular-2:1",
    addressOrder: "logical-effect-order",
    wledLedmapApplications: 1,
    target: {
      address: targetAddress,
      port: DDP_PORT,
      status: options.targetAddress ? "verified-runtime" : "saved-mdns-default",
    },
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    deploymentIdentity: deployment.deploymentIdentity,
    pixelCount: entries.length,
    frameRate: DEFAULT_FRAME_RATE,
    channelsPerPacket: DDP_CHANNELS_PER_PACKET,
    replacedFramePolicy: "keep-latest-complete-frame",
    outputColorChannels: "RGB",
    panelColorOrder: contract.wledColorOrder,
    pixels: entries.map((entry) => ({
      logicalIndex: entry.logicalIndex,
      u: entry.u,
      v: entry.v,
    })),
  };
}

export function touchDesignerDdpScript(): string {
  return `# LOO/UME TouchDesigner DDP sender.
# Load this file in an Execute DAT. Enable Start, Frame Start, and Exit.
import json
import socket
import time

import numpy as np

CONFIG_PATH = project.folder + "/touchdesigner/config.json"
_state = None


def _load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as source:
        config = json.load(source)
    if config.get("schemaVersion") != "1.0.0":
        raise ValueError("Unsupported LOO/UME TouchDesigner configuration.")
    pixels = config.get("pixels", [])
    if len(pixels) != config.get("pixelCount"):
        raise ValueError("The TouchDesigner pixel list is incomplete.")
    return config


def _write_status(state, error=""):
    config = state["config"]
    status = {
        "target": "{}:{}".format(config["target"]["address"], config["target"]["port"]),
        "mappingFingerprint": config["mappingFingerprint"],
        "deploymentIdentity": config["deploymentIdentity"],
        "frameRate": config["frameRate"],
        "sentFrames": state["sentFrames"],
        "replacedFrames": state["replacedFrames"],
        "error": error,
    }
    me.store("looUmeDdpStatus", status)
    table = op(config["statusDat"])
    if table is not None:
        table.clear()
        table.appendRow(["name", "value"])
        for name, value in status.items():
            table.appendRow([name, value])
    return status


def _ddp_packets(frame, state):
    maximum = state["config"]["channelsPerPacket"]
    packets = []
    for offset in range(0, len(frame), maximum):
        payload = frame[offset:offset + maximum]
        final = offset + len(payload) == len(frame)
        sequence = state["sequence"]
        state["sequence"] = sequence % 15 + 1
        header = bytes([
            0x41 if final else 0x40,
            sequence,
            0x0B,
            0x01,
        ]) + offset.to_bytes(4, "big") + len(payload).to_bytes(2, "big")
        packets.append(header + payload)
    return packets


def _sample_frame(image, pixels):
    height, width = image.shape[:2]
    x = np.asarray([round(pixel["u"] * (width - 1)) for pixel in pixels], dtype=np.intp)
    y = np.asarray([round((1.0 - pixel["v"]) * (height - 1)) for pixel in pixels], dtype=np.intp)
    rgb = np.clip(image[y, x, :3], 0.0, 1.0)
    return (rgb * 255.0 + 0.5).astype(np.uint8).reshape(-1).tobytes()


def onStart():
    global _state
    config = _load_config()
    source = op(config["sourceTop"])
    if source is None:
        raise ValueError("The configured TouchDesigner source TOP does not exist.")
    source.numpyArray(delayed=True)
    _state = {
        "config": config,
        "socket": socket.socket(socket.AF_INET, socket.SOCK_DGRAM),
        "sequence": 1,
        "nextFrameAt": 0.0,
        "sentFrames": 0,
        "replacedFrames": 0,
        "lastReportAt": 0.0,
    }
    _write_status(_state)
    return


def onFrameStart(frame):
    if _state is None:
        return
    now = time.monotonic()
    if now < _state["nextFrameAt"]:
        _state["replacedFrames"] += 1
        return
    config = _state["config"]
    image = op(config["sourceTop"]).numpyArray(delayed=True)
    if image is None:
        return
    try:
        payload = _sample_frame(image, config["pixels"])
        target = (config["target"]["address"], config["target"]["port"])
        for packet in _ddp_packets(payload, _state):
            _state["socket"].sendto(packet, target)
        _state["sentFrames"] += 1
        _state["nextFrameAt"] = now + 1.0 / config["frameRate"]
        if now - _state["lastReportAt"] >= 1.0:
            _write_status(_state)
            _state["lastReportAt"] = now
    except Exception as error:
        _write_status(_state, str(error))
        raise
    return


def onExit():
    global _state
    if _state is not None:
        _state["socket"].close()
        _state = None
    return
`;
}

function touchDesignerReadme(config: TouchDesignerConfig): string {
  return [
    "LOO/UME TOUCHDESIGNER DDP TEMPLATE",
    "",
    `Target: ${config.target.address}:${config.target.port}`,
    `Target status: ${config.target.status}`,
    `Mapping fingerprint: ${config.mappingFingerprint}`,
    `Deployment identity: ${config.deploymentIdentity}`,
    `LED count: ${config.pixelCount}`,
    `Frame rate: ${config.frameRate} FPS`,
    "Replaced frames: shown in /project1/loo_ume_status",
    "",
    "SETUP",
    "1. Extract the complete LOO/UME package.",
    "2. Save your TouchDesigner project in the extracted project folder.",
    "3. Create a 2:1 TOP at /project1/loo_ume_source.",
    "4. Create an Execute DAT at /project1/loo_ume_ddp.",
    "5. Set its file to touchdesigner/loo_ume_ddp.py.",
    "6. Enable Start, Frame Start, and Exit callbacks.",
    "7. Create a Table DAT at /project1/loo_ume_status.",
    "8. Start with a black image.",
    "9. Test one low-brightness pixel before full output.",
    "",
    "The script samples normalized pose-derived UV positions in logical LED order.",
    "The script sends RGB DDP. WLED applies the installed ledmap one time.",
    "NumPy and Python sockets are included with TouchDesigner. No external plugin is required.",
    "",
  ].join("\n");
}

export function createTouchDesignerPackageFiles(
  contract: HardwareMappingContract,
  sculptureBytes: string,
  options: TouchDesignerPackageOptions = {},
): Map<string, Uint8Array> {
  const config = createTouchDesignerConfig(contract, sculptureBytes, options);
  return new Map([
    ["config.json", jsonBytes(config)],
    ["loo_ume_ddp.py", encoder.encode(touchDesignerDdpScript())],
    ["README.txt", encoder.encode(touchDesignerReadme(config))],
  ]);
}
