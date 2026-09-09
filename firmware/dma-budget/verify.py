#!/usr/bin/env python3
"""Verify the DMA budget candidate against the preserved firmware2609096."""
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
BASE = Path(sys.argv[1]).resolve()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


receipt = json.loads((ROOT / "firmware/ddp-dma/build-receipt.json").read_text())
spec = importlib.util.spec_from_file_location("budget_patch", HERE / "patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
for name, digest in receipt["inputs"].items():
    assert sha(BASE / name) == digest, name
with tempfile.TemporaryDirectory() as directory:
    expected = Path(directory)
    (expected / "wled00").mkdir()
    for name in patch.HASHES:
        shutil.copyfile(BASE / "wled00" / name, expected / "wled00" / name)
    patch.apply(expected)
    for name in receipt["inputs"]:
        reference = expected / name if name.removeprefix("wled00/") in patch.HASHES else BASE / name
        assert (SOURCE / name).read_bytes() == reference.read_bytes(), name
    try:
        patch.apply(expected)
        raise AssertionError("Repeated patch was accepted")
    except ValueError:
        pass

build = SOURCE / ".pio/build/orbital_esp32dev"
commands = json.loads((SOURCE / "compile_commands.json").read_text())
for name in ("FX_fcn.cpp", "audio_reactive.cpp", "loo_ddp.cpp"):
    command = next(item for item in commands if item["file"].endswith(name))
    flags = command.get("command", " ".join(command.get("arguments", [])))
    assert Path(command["directory"]).resolve() == SOURCE
    assert str(ROOT / "build/firmware-core") in flags
    for flag in ("UM_AUDIOREACTIVE_ENABLE", "SR_DMTYPE=1", "I2S_SDPIN=32", "I2S_WSPIN=26", "I2S_CKPIN=27"):
        assert f"-D{flag}" in flags or f"-D {flag}" in flags, flag
tool = ROOT / "build/firmware-core/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"
symbols = subprocess.check_output([str(tool), "-C", "-S", str(build / "firmware.elf")], text=True)
for name in ("AudioReactive::setup", "FFTcode", "looDdpReset", "loo_dma_active_lanes", "i2sDmaISR"):
    assert name in symbols, name
assert "NeoEspI2sMuxBusSize8Bit3Step" in symbols
for line in symbols.splitlines():
    if "i2sDmaISR" in line or "loo_rmt_encode_led_strip" in line:
        assert 0x40080000 <= int(line.split()[0], 16) < 0x400A0000, line
image = build / "firmware.bin"
assert image.read_bytes()[0] == 0xE9 and image.stat().st_size < 0x1F0000
assert "#define VERSION 2609097" in (SOURCE / "wled00/wled.h").read_text()
output = ROOT / "build/firmware-dma-budget"
output.mkdir(exist_ok=True)
target = output / "wled-audio-ddp-dma-2609097.bin"
shutil.copyfile(image, target)
result = {
    "buildId": 2609097,
    "baselineBuildId": 2609096,
    "baselineArtifactSha256": receipt["artifact"]["sha256"],
    "status": "build-verified",
    "inputs": {name: sha(SOURCE / name) for name in receipt["inputs"]},
    "scripts": {p.name: sha(p) for p in HERE.glob("*.py")},
    "elfSha256": sha(build / "firmware.elf"),
    "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "artifact": {"name": target.name, "byteLength": target.stat().st_size, "sha256": sha(target)},
    "physicalAcceptance": "Pending DMA, DDP, audio, and restart checks.",
}
(HERE / "build-receipt.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result["artifact"]))
