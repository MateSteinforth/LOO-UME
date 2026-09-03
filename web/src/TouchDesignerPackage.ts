import { createWledDeploymentBundle } from "../../src/wled/DeploymentContract.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";
import {
  TOUCHDESIGNER_TOX_BYTES,
  TOUCHDESIGNER_TOX_RECEIPT,
} from "./TouchDesignerToxArtifact.ts";

const encoder = new TextEncoder();
const DDP_PORT = 4048;
const DDP_CHANNELS_PER_PACKET = 1_440;
const DEFAULT_FRAME_RATE = 30;

export interface TouchDesignerPackageOptions {
  simulatorAddress?: string;
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
  sculptureMirror: {
    status: "ready" | "simulator-only";
    wledLedmapApplications: 1;
  };
  target: {
    address: string;
    port: typeof DDP_PORT;
    status: "local-default" | "configured-private-host";
  };
  mappingFingerprint: string;
  mappingFingerprintVersion: HardwareMappingContract["fingerprintVersion"];
  deploymentIdentity: string | null;
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
  if (value === "loo-ume.local" || value === "localhost") return true;
  const parts = value.split(".").map(Number);
  return parts.length === 4 && parts.every((part) =>
    Number.isInteger(part) && part >= 0 && part <= 255
  ) && (
    parts[0] === 127 ||
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
  const simulatorAddress = options.simulatorAddress ?? "127.0.0.1";
  if (!validTargetAddress(simulatorAddress)) {
    throw new Error("TouchDesigner output requires a local name or a private IPv4 address.");
  }
  const entries = [...contract.mapping.entries]
    .sort((first, second) => first.logicalIndex - second.logicalIndex);
  if (
    entries.length < 1 ||
    entries.length > 2_624 ||
    entries.some((entry, index) => entry.logicalIndex !== index)
  ) {
    throw new Error("TouchDesigner output requires from 1 through 2,624 complete logical LED indices.");
  }
  let deployment: ReturnType<typeof createWledDeploymentBundle> | undefined;
  if (contract.readiness.mappingReady) {
    try {
      deployment = createWledDeploymentBundle(contract, sculptureBytes);
    } catch {
      deployment = undefined;
    }
  }
  return {
    schemaVersion: "1.0.0",
    generator: "loo-ume-touchdesigner-ddp",
    sourceTop: "/project1/loo_ume_source",
    statusDat: "/project1/loo_ume_status",
    inputProjection: "equirectangular-2:1",
    addressOrder: "logical-effect-order",
    sculptureMirror: {
      status: deployment ? "ready" : "simulator-only",
      wledLedmapApplications: 1,
    },
    target: {
      address: simulatorAddress,
      port: DDP_PORT,
      status: options.simulatorAddress ? "configured-private-host" : "local-default",
    },
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    deploymentIdentity: deployment?.deploymentIdentity ?? null,
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
  return `# LOO/UME TouchDesigner DDP component callback.
import json
import os
import socket
import time

import numpy as np

_state = None


def _component():
    return me.parent()


def _config_path():
    configured = _component().par.Configfile.eval().strip() or "config.json"
    if os.path.isabs(configured):
        return configured
    external = _component().par.externaltox.eval().strip()
    if external:
        expanded = tdu.expandPath(external)
        return os.path.join(os.path.dirname(expanded), configured)
    return os.path.join(project.folder, "touchdesigner", configured)


def _load_config():
    with open(_config_path(), "r", encoding="utf-8") as source:
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
        "simulatorTarget": "{}:{}".format(config["target"]["address"], config["target"]["port"]),
        "mappingFingerprint": config["mappingFingerprint"],
        "deploymentIdentity": config["deploymentIdentity"],
        "frameRate": config["frameRate"],
        "sentFrames": state["sentFrames"],
        "sentPackets": state["sentPackets"],
        "replacedFrames": state["replacedFrames"],
        "error": error,
    }
    me.store("looUmeDdpStatus", status)
    table = _component().op("status")
    table.clear()
    table.appendRow(["name", "value"])
    for name, value in status.items():
        table.appendRow([name, value])
    _component().par.Status = error or "{} FPS · {} frames sent".format(
        config["frameRate"], state["sentFrames"]
    )
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
    if width != height * 2:
        raise ValueError("The internal LOO/UME image must have a 2:1 resolution.")
    x = np.asarray([round(pixel["u"] * (width - 1)) for pixel in pixels], dtype=np.intp)
    y = np.asarray([round((1.0 - pixel["v"]) * (height - 1)) for pixel in pixels], dtype=np.intp)
    rgb = np.clip(image[y, x, :3], 0.0, 1.0)
    return (rgb * 255.0 + 0.5).astype(np.uint8).reshape(-1).tobytes()


def _close():
    global _state
    if _state is not None:
        _state["socket"].close()
        _state = None


def _settings():
    component = _component()
    return (
        component.par.Target.eval().strip(),
        int(component.par.Port.eval()),
        int(component.par.Framerate.eval()),
        component.par.Configfile.eval().strip(),
    )


def _start():
    global _state
    config = _load_config()
    settings = _settings()
    config["target"] = {
        "address": settings[0],
        "port": settings[1],
    }
    config["frameRate"] = settings[2]
    if not config["target"]["address"]:
        raise ValueError("The DDP target address is empty.")
    source = _component().op("input")
    source.numpyArray(delayed=True)
    _state = {
        "config": config,
        "socket": socket.socket(socket.AF_INET, socket.SOCK_DGRAM),
        "sequence": 1,
        "nextFrameAt": 0.0,
        "sentFrames": 0,
        "replacedFrames": 0,
        "sentPackets": 0,
        "lastReportAt": 0.0,
        "settings": settings,
    }
    _write_status(_state)


def onStart():
    _close()
    return


def create():
    _close()
    return


def onFrameStart(frame):
    global _state
    if not _component().par.Active.eval():
        if _state is not None:
            _close()
        _component().par.Status = "Disabled"
        return
    if _state is not None and _state["settings"] != _settings():
        _close()
    if _state is None:
        try:
            _start()
        except Exception as error:
            _component().par.Status = str(error)
            return
    now = time.monotonic()
    if now < _state["nextFrameAt"]:
        _state["replacedFrames"] += 1
        return
    config = _state["config"]
    image = _component().op("input").numpyArray(delayed=True)
    if image is None:
        return
    try:
        payload = _sample_frame(image, config["pixels"])
        target = (config["target"]["address"], config["target"]["port"])
        for packet in _ddp_packets(payload, _state):
            _state["socket"].sendto(packet, target)
            _state["sentPackets"] += 1
        _state["sentFrames"] += 1
        _state["nextFrameAt"] = now + 1.0 / config["frameRate"]
        if now - _state["lastReportAt"] >= 1.0:
            _write_status(_state)
            _state["lastReportAt"] = now
    except Exception as error:
        _write_status(_state, str(error))
        _state["nextFrameAt"] = now + 1.0
    return


def onExit():
    _close()
    return
`;
}

export function touchDesignerToxBuilderScript(): string {
  return `# Run this script in TouchDesigner 2025.31550.
import hashlib
import json
import os

folder = os.path.join(project.folder, "touchdesigner")
source_path = os.path.join(folder, "loo_ume_ddp.py")
output_path = os.path.join(folder, "loo_ume_ddp.tox")
receipt_path = os.path.join(folder, "loo_ume_ddp.tox.json")
owner = op("/project1")
if owner is None:
    raise RuntimeError("The TouchDesigner project does not contain /project1.")
if owner.op("loo_ume_ddp") is not None:
    raise RuntimeError("Delete /project1/loo_ume_ddp before you run this builder again.")
if not os.path.isfile(source_path):
    raise RuntimeError("The TouchDesigner package does not contain loo_ume_ddp.py.")

component = owner.create(baseCOMP, "loo_ume_ddp")
component.nodeX = 0
component.nodeY = 0
component.comment = "LOO/UME TOP to logical DDP"

page = component.appendCustomPage("LOO UME DDP")
active = page.appendToggle("Active", label="Active")[0]
active.default = True
active.val = True
target = page.appendStr("Target", label="Simulator Address")[0]
target.default = "127.0.0.1"
target.val = "127.0.0.1"
port = page.appendInt("Port", label="DDP Port")[0]
port.default = 4048
port.val = 4048
port.min = 1
port.max = 65535
port.clampMin = True
port.clampMax = True
frame_rate = page.appendInt("Framerate", label="Frame Rate")[0]
frame_rate.default = 30
frame_rate.val = 30
frame_rate.min = 1
frame_rate.max = 60
frame_rate.clampMin = True
frame_rate.clampMax = True
config_file = page.appendStr("Configfile", label="Mapping Configuration")[0]
config_file.default = "config.json"
config_file.val = "config.json"
status_par = page.appendStr("Status", label="Status")[0]
status_par.default = "Waiting for a TOP"
status_par.val = "Waiting for a TOP"

source_top = component.create(inTOP, "source")
source_top.nodeX = -400
source_top.nodeY = 100
source_top.par.label = "Image TOP"
input_top = component.create(fitTOP, "input")
input_top.nodeX = -150
input_top.nodeY = 100
input_top.par.fit = "fitoutside"
input_top.par.outputresolution = "custom"
input_top.par.resolutionw = 1280
input_top.par.resolutionh = 640
input_top.par.outputaspect = "resolution"
input_top.par.resmult = False
source_top.outputConnectors[0].connect(input_top)
output_top = component.create(outTOP, "output")
output_top.nodeX = 150
output_top.nodeY = 100
output_top.par.label = "Centered 2:1 image"
input_top.outputConnectors[0].connect(output_top)
component.par.opviewer = "./output"

status = component.create(tableDAT, "status")
status.nodeX = 300
status.nodeY = -100
status.appendRow(["name", "value"])

callback = component.create(executeDAT, "sender")
callback.nodeX = 0
callback.nodeY = -100
with open(source_path, "r", encoding="utf-8") as source:
    callback.text = source.read()
callback.par.start = True
callback.par.create = True
callback.par.framestart = True
callback.par.exit = True

component.save(output_path, createFolders=True)
with open(output_path, "rb") as source:
    tox_bytes = source.read()
with open(receipt_path, "w", encoding="utf-8") as target_file:
    json.dump({
        "schemaVersion": "1.0.0",
        "artifact": "loo_ume_ddp.tox",
        "touchDesignerVersion": app.version,
        "touchDesignerBuild": app.build,
        "operatingSystem": app.osName,
        "byteLength": len(tox_bytes),
        "sha256": hashlib.sha256(tox_bytes).hexdigest(),
    }, target_file, indent=2)
    target_file.write("\\n")
print("Created " + output_path)
print("Created " + receipt_path)
`;
}

function touchDesignerReadme(config: TouchDesignerConfig): string {
  return [
    "LOO/UME TOUCHDESIGNER DDP TEMPLATE",
    "",
    `Simulator target: ${config.target.address}:${config.target.port}`,
    `Simulator target status: ${config.target.status}`,
    `Mapping fingerprint: ${config.mappingFingerprint}`,
    `Deployment identity: ${config.deploymentIdentity}`,
    `Sculpture mirror: ${config.sculptureMirror.status}`,
    `LED count: ${config.pixelCount}`,
    `Frame rate: ${config.frameRate} FPS`,
    "Replaced frames: shown in /project1/loo_ume_status",
    "",
    "SETUP",
    "1. Extract the complete LOO/UME package.",
    "2. Save your TouchDesigner project in the extracted project folder.",
    "3. Drag loo_ume_ddp.tox into the TouchDesigner network.",
    "4. Connect one TOP to the component input.",
    "5. Keep Active enabled.",
    "6. Start with a black image.",
    "7. Test one low-brightness pixel before full output.",
    "",
    "The component center-crops its input to 2:1 at 1280 x 640.",
    "The script samples normalized pose-derived UV positions in logical LED order.",
    "The script sends each RGB DDP frame to the simulator.",
    "Keep LOO/UME open on the TouchDesigner computer for the local simulator target.",
    "Set the simulator address to its LAN address when LOO/UME runs on another computer.",
    config.sculptureMirror.status === "ready"
      ? "LOO/UME forwards the visible simulator frame when the configured WLED sculpture is connected."
      : "Complete mapping and WLED setup before sculpture mirroring. Simulator DDP input is available now.",
    "WLED applies the installed ledmap one time. The simulator uses the same logical input.",
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
    ["loo_ume_ddp.tox", Uint8Array.from(TOUCHDESIGNER_TOX_BYTES)],
    ["loo_ume_ddp.tox.json", jsonBytes(TOUCHDESIGNER_TOX_RECEIPT)],
    ["build_loo_ume_tox.py", encoder.encode(touchDesignerToxBuilderScript())],
    ["README.txt", encoder.encode(touchDesignerReadme(config))],
  ]);
}
