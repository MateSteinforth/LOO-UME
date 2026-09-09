#!/usr/bin/env python3
"""Verify the combined firmware against the preserved one-shot DMA candidate."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "build/firmware-source"
BASE = Path("/tmp/loo-ume-ddp-dma-attended/build/firmware-oneshot-source")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


baseline = json.loads((ROOT / "firmware/dma-oneshot/build-receipt.json").read_text())
spec = importlib.util.spec_from_file_location("expiry_patch", HERE / "patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
for name, digest in baseline["inputs"].items():
    assert sha(BASE / name) == digest, name
with tempfile.TemporaryDirectory() as directory:
    expected = Path(directory)
    for name in patch.HASHES:
        (expected / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(BASE / name, expected / name)
    patch.apply(expected)
    for name in baseline["inputs"]:
        reference = expected / name if name in patch.HASHES else BASE / name
        assert (SOURCE / name).read_bytes() == reference.read_bytes(), name
    try:
        patch.apply(expected)
        raise AssertionError("Repeated patch was accepted")
    except ValueError:
        pass
commands = json.loads((SOURCE / "compile_commands.json").read_text())
for name in ("loo_ddp.cpp", "audio_reactive.cpp", "Esp32_i2s.c"):
    entry = next(item for item in commands if item["file"].endswith(name))
    flags = entry.get("command", " ".join(entry.get("arguments", [])))
    assert Path(entry["directory"]).resolve() == SOURCE
    assert str(ROOT / "build/firmware-core") in flags
    if name == "Esp32_i2s.c":
        assert "NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575" in entry["file"]
        assert "Core_2_x" in entry["file"]
    for flag in ("UM_AUDIOREACTIVE_ENABLE", "SR_DMTYPE=1", "I2S_SDPIN=32", "I2S_WSPIN=26", "I2S_CKPIN=27"):
        assert f"-D{flag}" in flags or f"-D {flag}" in flags, flag
build = SOURCE / ".pio/build/orbital_esp32dev"
tool = ROOT / "build/firmware-core/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"
symbols = subprocess.check_output([str(tool), "-C", "-S", str(build / "firmware.elf")], text=True)
for name in ("AudioReactive::setup", "FFTcode", "looDdpReset", "i2sDmaISR"):
    assert name in symbols, name
assert "NeoEspI2sMuxBusSize8Bit3Step" in symbols
for line in symbols.splitlines():
    if "i2sDmaISR" in line or "loo_rmt_encode_led_strip" in line:
        assert 0x40080000 <= int(line.split()[0], 16) < 0x400A0000, line
image = build / "firmware.bin"
assert image.read_bytes()[0] == 0xE9 and image.stat().st_size < 0x1F0000
assert "#define VERSION 2609099" in (SOURCE / "wled00/wled.h").read_text()
output = ROOT / "build/firmware-unified"
output.mkdir(exist_ok=True)
target = output / "wled-audio-ddp-2609099.bin"
shutil.copyfile(image, target)
receipt = {
    "buildId": 2609099, "baselineBuildId": 2609098, "status": "build-verified",
    "baselineArtifactSha256": baseline["artifact"]["sha256"],
    "inputs": {name: sha(SOURCE / name) for name in baseline["inputs"]},
    "checks": {str(p.relative_to(ROOT)): sha(p) for p in [*sorted(HERE.glob("*.py")), HERE / "test-expiry.cpp", ROOT / "firmware/ddp-dma/test-service.py"]},
    "elfSha256": sha(build / "firmware.elf"), "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "artifact": {"name": target.name, "byteLength": target.stat().st_size, "sha256": sha(target)},
    "physicalAcceptance": "Pending static and moving DDP, throughput, standalone audio, and restart checks.",
}
(HERE / "build-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt["artifact"]))
