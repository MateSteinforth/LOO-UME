#!/usr/bin/env python3
"""Verify source, compiler evidence, and the complete-frame DMA image."""
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
baseline = Path(sys.argv[1]).resolve()
receipt = json.loads((ROOT / "firmware/dma-output/build-receipt.json").read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


spec = importlib.util.spec_from_file_location("ddp_patch", HERE / "patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
for name, expected in receipt["inputs"].items():
    assert sha(baseline / name) == expected, name
changed = [f"wled00/{name}" for name in patch.HASHES]
with tempfile.TemporaryDirectory() as directory:
    expected = Path(directory)
    (expected / "wled00").mkdir()
    for name in changed:
        shutil.copyfile(baseline / name, expected / name)
    patch.apply(expected)
    changed += [f"wled00/{name}" for name in ("DdpFrames.h", "loo_ddp.h", "loo_ddp.cpp")]
    for name in changed:
        assert (SOURCE / name).read_bytes() == (expected / name).read_bytes(), name
    try:
        patch.apply(expected)
        raise AssertionError("Repeated patch was accepted")
    except ValueError:
        pass

unchanged = [name for name in receipt["inputs"] if name not in changed]
unchanged += ["usermods/audioreactive/audio_reactive.cpp",
              "usermods/audioreactive/audio_source.h", "platformio_override.ini"]
for name in unchanged:
    assert (SOURCE / name).read_bytes() == (baseline / name).read_bytes(), name
versions = {}
for key, name in (
    ("platformVersion", "platforms/espressif32/platform.json"),
    ("frameworkVersion", "packages/framework-arduinoespressif32/package.json"),
    ("toolchainVersion", "packages/toolchain-xtensa-esp-elf/package.json"),
    ("esptoolVersion", "packages/tool-esptoolpy/package.json"),
):
    versions[key] = json.loads((CORE / name).read_text())["version"]
    assert versions[key] == receipt["versions"][key], key
commands = json.loads((SOURCE / "compile_commands.json").read_text())
for name in ("audio_reactive.cpp", "loo_ddp.cpp", "loo_dma_status.cpp"):
    command = next(item for item in commands if item["file"].endswith(name))
    flags = command.get("command", " ".join(command.get("arguments", [])))
    assert Path(command["directory"]).resolve() == SOURCE
    assert str(CORE) in flags
    for flag in ("UM_AUDIOREACTIVE_ENABLE", "SR_DMTYPE=1", "I2S_SDPIN=32", "I2S_WSPIN=26", "I2S_CKPIN=27", "MCLK_PIN=-1"):
        assert f"-D{flag}" in flags or f"-D {flag}" in flags, flag
elf = BUILD / "firmware.elf"
bin_dir = CORE / "packages/toolchain-xtensa-esp-elf/bin"
symbols = subprocess.check_output([str(bin_dir / "xtensa-esp32-elf-nm"), "-C", "-S", str(elf)], text=True)
for name in ("AudioReactive::setup", "FFTcode", "LooDmaStatus::addToJsonInfo", "loo_dma_allocated",
             "i2sInit", "rmt_new_tx_channel", "looDdpExit", "looDdpReset", "txCompleted", "presented", "DdpFrames"):
    assert name in symbols, name
assert "NeoEspI2sMonoBuffContext<NeoEspI2sMuxMap<unsigned char, NeoEspI2sMuxBusSize8Bit3Step> >, NeoEsp32I2sBusOne" in symbols
callbacks = [line for line in symbols.splitlines() if "loo_rmt_encode_led_strip" in line]
assert callbacks and all(0x40080000 <= int(line.split()[0], 16) < 0x400A0000 for line in callbacks)
frame_symbols = [line for line in symbols.splitlines() if line.split()[-1] == "frames" or "_ZL6frames$" in line]
assert len(frame_symbols) == 1 and int(frame_symbols[0].split()[1], 16) >= 23616
size_output = subprocess.check_output([str(bin_dir / "xtensa-esp32-elf-size"), str(elf)], text=True)
image = BUILD / "firmware.bin"
assert image.read_bytes()[0] == 0xE9 and image.stat().st_size < 0x1F0000
assert "#define VERSION 2609096" in (SOURCE / "wled00/wled.h").read_text()
output = ROOT / "build/firmware-ddp-dma"
output.mkdir(exist_ok=True)
target = output / "wled-audio-ddp-dma-2609096.bin"
shutil.copyfile(image, target)
(output / "symbols.txt").write_text(symbols)
result = {
    "status": "built-not-installed", "buildId": 2609096, "baselineBuildId": 2609095,
    "wledCommit": receipt["wledCommit"], "neoPixelBusCommit": receipt["neoPixelBusCommit"],
    "versions": versions, "audioCompiled": True, "audioSourceUnchanged": True,
    "defaultDriverChanged": False, "ddpReceiverChanged": True,
    "memory": {"queuePixelBytes": 23616, "queueObjectBytes": int(frame_symbols[0].split()[1], 16),
               "dmaEncodedBytes": 51408, "frontBytes": 7872, "knownPixelBuffersTotalBytes": 82896,
               "runtimeCapacityVerified": False, "elfSize": size_output.strip()},
    "inputs": {name: sha(SOURCE / name) for name in changed + unchanged},
    "scripts": {path.name: sha(path) for path in sorted(HERE.iterdir()) if path.suffix in (".py", ".cpp", ".h")},
    "elfSha256": sha(elf), "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "artifact": {"name": target.name, "byteLength": target.stat().st_size, "sha256": sha(target)},
    "physicalAcceptance": "Pending attended DDP, audio, and memory checks; no live changes",
}
text = json.dumps(result, indent=2) + "\n"
(HERE / "build-receipt.json").write_text(text)
(output / "build-receipt.json").write_text(text)
print(text)
