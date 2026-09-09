#!/usr/bin/env python3
"""Verify the isolated DMA candidate against the pinned audio baseline."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "build/firmware-source"
CORE = ROOT / "build/firmware-core"
BUILD = SOURCE / ".pio/build/orbital_esp32dev"
NPB_REL = Path(".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575")
baseline = Path(sys.argv[1])


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


backend = module("dma_patch", HERE / "patch.py")
wled = module("wled_patch", HERE / "patch-wled.py")
changed = [Path("wled00") / name for name in ("bus_wrapper.h", "bus_manager.cpp", "FX_fcn.cpp", "wled.h")]
changed.append(NPB_REL / "src/NeoPixelBus.h")
changed.extend(NPB_REL / value[0] for value in backend.FILES.values())
with tempfile.TemporaryDirectory() as directory:
    expected = Path(directory)
    for path in changed:
        (expected / path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(baseline / path, expected / path)
    backend.apply(expected / NPB_REL)
    wled.apply(expected, expected / NPB_REL)
    changed.extend(Path("wled00") / name for name in ("loo_dma_status.h", "loo_dma_status.cpp"))
    for path in changed:
        assert (SOURCE / path).read_bytes() == (expected / path).read_bytes(), path

rmt = NPB_REL / "src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h"
assert sha(SOURCE / rmt) == "a05b6bff508c4390cd5988449cff72590405a20947d4003201ee363b41845995"
for path in ("wled00/e131.cpp", "wled00/udp.cpp", "wled00/wled.cpp", "wled00/FX.h",
             "usermods/audioreactive/audio_reactive.cpp", "usermods/audioreactive/audio_source.h"):
    assert (SOURCE / path).read_bytes() == (baseline / path).read_bytes(), path
assert (SOURCE / "platformio_override.ini").read_bytes() == (ROOT / "firmware/audio-reactive/platformio.ini").read_bytes()
receipt = json.loads((ROOT / "firmware/audio-reactive/build-receipt.json").read_text())
versions = {}
for key, path in (
    ("platformVersion", "platforms/espressif32/platform.json"),
    ("frameworkVersion", "packages/framework-arduinoespressif32/package.json"),
    ("toolchainVersion", "packages/toolchain-xtensa-esp-elf/package.json"),
    ("esptoolVersion", "packages/tool-esptoolpy/package.json"),
):
    versions[key] = json.loads((CORE / path).read_text())["version"]
    assert versions[key] == receipt["target"][key], key
commands = json.loads((SOURCE / "compile_commands.json").read_text())
audio = next(item for item in commands if item["file"].endswith("audio_reactive.cpp"))
flags = audio.get("command", " ".join(audio.get("arguments", [])))
for flag in ("UM_AUDIOREACTIVE_ENABLE", "SR_DMTYPE=1", "I2S_SDPIN=32", "I2S_WSPIN=26", "I2S_CKPIN=27", "MCLK_PIN=-1"):
    assert f"-D{flag}" in flags or f"-D {flag}" in flags, flag
assert any(item["file"].endswith("loo_dma_status.cpp") for item in commands)
dependencies = (BUILD / "src/bus_manager.cpp.d").read_text()
assert "Core_2_x/NeoEsp32I2sXMethod.h" in dependencies
assert "NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575" in dependencies
elf = BUILD / "firmware.elf"
symbols = subprocess.check_output([str(CORE / "packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"), "-C", str(elf)], text=True)
for symbol in ("LooDmaStatus::addToJsonInfo", "AudioReactive::setup", "FFTcode", "i2sInit", "loo_dma_allocated", "rmt_new_tx_channel", "NeoEsp32I2sBusOne"):
    assert symbol in symbols, symbol
assert "NeoEspI2sMonoBuffContext<NeoEspI2sMuxMap<unsigned char, NeoEspI2sMuxBusSize8Bit3Step> >, NeoEsp32I2sBusOne" in symbols
callbacks = [line for line in symbols.splitlines() if "loo_rmt_encode_led_strip" in line]
assert callbacks and all(0x40080000 <= int(line.split()[0], 16) < 0x400A0000 for line in callbacks)
assert (SOURCE / "wled00/wled.h").read_text().count("#define VERSION 2609095") == 1
image = BUILD / "firmware.bin"
assert image.read_bytes()[0] == 0xE9 and image.stat().st_size < 0x1F0000
output = ROOT / "build/firmware-dma-output"
output.mkdir(exist_ok=True)
target = output / "wled-audio-dma-guarded-2609095.bin"
shutil.copyfile(image, target)
(output / "symbols.txt").write_text(symbols)
result = {
    "status": "built-not-installed",
    "buildId": 2609095,
    "baselineBuildId": 2609085,
    "wledCommit": receipt["target"]["wledCommit"],
    "neoPixelBusCommit": receipt["inputs"]["neopixelBus"]["commit"],
    "versions": versions,
    "audioCompiled": True,
    "defaultDriverChanged": False,
    "ddpReceiverChanged": False,
    "dmaScope": "Classic ESP32 I2S1; four RGB buses; 1–704 pixels per bus; no skipped pixels",
    "memory": {"encodedBytesAt704Pixels": 51408, "frontBytesAt2624Pixels": 7872, "futureThreeDdpFramesBytes": 23616, "runtimeCapacityVerified": False},
    "inputs": {str(path): sha(SOURCE / path) for path in changed + [rmt]},
    "scripts": {path.name: sha(path) for path in sorted(HERE.iterdir()) if path.suffix in (".py", ".cpp", ".h")},
    "elfSha256": sha(elf),
    "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "artifact": {"name": target.name, "byteLength": target.stat().st_size, "sha256": sha(target)},
    "physicalAcceptance": "Pending operator review; no live changes in this task",
}
text = json.dumps(result, indent=2) + "\n"
(HERE / "build-receipt.json").write_text(text)
(output / "build-receipt.json").write_text(text)
print(text)
