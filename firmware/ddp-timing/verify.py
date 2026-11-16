#!/usr/bin/env python3
"""Verify candidate 2609103 against the preserved 2609099 source and write its receipt."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # Do not leave __pycache__ in the tracked firmware directories.
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "build/firmware-source"
BASE = Path("/tmp/loo-ume-ddp-audio-unified/build/firmware-source")
BASE_IMAGE = Path("/tmp/loo-ume-ddp-audio-unified/build/firmware-unified/wled-audio-ddp-2609099.bin")
TOOLS = ROOT / "build/firmware-core/packages/toolchain-xtensa-esp-elf/bin"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sections(elf):
    """Return the allocated size of each ESP32 memory region section."""
    output = subprocess.check_output([str(TOOLS / "xtensa-esp32-elf-size"), "-A", str(elf)], text=True)
    wanted = (".dram0.data", ".dram0.bss", ".iram0.text", ".flash.text", ".flash.rodata")
    result = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] in wanted:
            result[parts[0]] = int(parts[1])
    return result


def symbol_sizes(symbols, patterns):
    sizes = {}
    for line in symbols.splitlines():
        parts = line.split(maxsplit=3)
        if len(parts) == 4:
            for label, pattern in patterns.items():
                if re.search(pattern, parts[3]):
                    sizes[label] = int(parts[1], 16)
    return sizes


baseline = json.loads((ROOT / "firmware/ddp-expiry/build-receipt.json").read_text())
patch = load("timing_patch", HERE / "patch.py")
for name, digest in baseline["inputs"].items():
    assert sha(BASE / name) == digest, name
assert sha(BASE_IMAGE) == baseline["artifact"]["sha256"], "The 2609099 image changed."
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
for name in patch.COPIED:
    assert (SOURCE / "wled00" / name).read_bytes() == (HERE / name).read_bytes(), name
commands = json.loads((SOURCE / "compile_commands.json").read_text())
for name in ("loo_ddp.cpp", "json.cpp", "audio_reactive.cpp", "Esp32_i2s.c"):
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
elf = build / "firmware.elf"
symbols = subprocess.check_output([str(TOOLS / "xtensa-esp32-elf-nm"), "-C", "-S", str(elf)], text=True)
for name in ("AudioReactive::setup", "FFTcode", "looDdpReset", "looDdpExit", "i2sDmaISR"):
    assert name in symbols, name
# LTO inlines looDdpService() and looDdpControl() into their single callers. Check their state objects,
# the larger state parser, and the new JSON keys instead of function symbols.
for pattern in (r"_ZL16overlapRequested", r"_ZL5phase\b", r"_ZL11lastShownUs", r"_ZL14wireEstimateUs",
                r"_ZL18presentedInSession", r"_ZL6timing\b"):
    assert re.search(pattern, symbols), pattern
base_elf = BASE / ".pio/build/orbital_esp32dev/firmware.elf"
baseline_symbols = subprocess.check_output([str(TOOLS / "xtensa-esp32-elf-nm"), "-C", "-S", str(base_elf)], text=True)
parser = r"deserializeState\(ArduinoJson6181_90::ObjectRef, unsigned char, unsigned char\)$"
assert symbol_sizes(symbols, {"p": parser})["p"] > symbol_sizes(baseline_symbols, {"p": parser})["p"]
for key in (b"overlap_active", b"wire_estimate_us", b"replaced_wire", b"wait_idle"):
    assert key in (SOURCE / ".pio/build/orbital_esp32dev/firmware.bin").read_bytes(), key
    assert key not in BASE_IMAGE.read_bytes(), key
assert "NeoEspI2sMuxBusSize8Bit3Step" in symbols
for line in symbols.splitlines():
    if "i2sDmaISR" in line or "loo_rmt_encode_led_strip" in line:
        assert 0x40080000 <= int(line.split()[0], 16) < 0x400A0000, line
image = build / "firmware.bin"
assert image.read_bytes()[0] == 0xE9 and image.stat().st_size < 0x1F0000
assert "#define VERSION 2609103" in (SOURCE / "wled00/wled.h").read_text()
# LTO keeps file-static objects under mangled names with an lto_priv suffix.
OBJECTS = {
    "frames": r"^_ZL6frames(\$lto_priv\$\d+)?$",
    "timing": r"^_ZL6timing(\$lto_priv\$\d+)?$",
    "timingSnapshot": r"looDdpJson\(.*\)::snapshot$",
}
memory = symbol_sizes(symbols, OBJECTS)
assert memory.get("frames", 0) > 3 * 7872 and "timing" in memory and "timingSnapshot" in memory, memory
baseline_memory = symbol_sizes(baseline_symbols, {"frames": OBJECTS["frames"]})
candidate_sections = sections(elf)
baseline_sections = sections(base_elf)
output = ROOT / "build/firmware-timing"
output.mkdir(exist_ok=True)
target = output / "wled-audio-ddp-timing-2609103.bin"
shutil.copyfile(image, target)
receipt = {
    "buildId": 2609103, "baselineBuildId": 2609099, "status": "build-verified",
    "baselineArtifactSha256": baseline["artifact"]["sha256"],
    "inputs": {name: sha(SOURCE / name) for name in baseline["inputs"]},
    "checks": {str(p.relative_to(ROOT)): sha(p) for p in [
        *sorted(HERE.glob("*.py")), HERE / "service-harness.cpp", HERE / "fake-wled.h",
        ROOT / "firmware/ddp-dma/test-service.py", ROOT / "firmware/ddp-dma/test-queue.cpp",
        ROOT / "firmware/ddp-expiry/test-expiry.cpp"]},
    "elfSha256": sha(elf), "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "staticObjectBytes": {"candidate": memory, "baseline2609099": baseline_memory},
    "sectionBytes": {"candidate": candidate_sections, "baseline2609099": baseline_sections},
    "artifact": {"name": target.name, "byteLength": target.stat().st_size, "sha256": sha(target)},
    "defaults": "Overlap is off at every boot. Timing telemetry is always on.",
    "physicalAcceptance": "Pending an attended overlap off/on comparison, standalone audio, ledmap, and timeout checks.",
}
(HERE / "build-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"artifact": receipt["artifact"], "staticObjectBytes": memory,
                  "sectionDelta": {k: candidate_sections.get(k, 0) - baseline_sections.get(k, 0)
                                   for k in candidate_sections}}, indent=2))
