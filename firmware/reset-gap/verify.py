#!/usr/bin/env python3
"""Verify the isolated 2609093 build and save its OTA image and receipt."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "build/firmware-source"
CORE = ROOT / "build/firmware-toolchain/core"
BUILD = SOURCE / ".pio/build/orbital_esp32dev"
NPB = SOURCE / ".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575"
HEADER = "src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h"
BINUTILS = CORE / "tools/toolchain-xtensa-esp-elf/bin"
ELF = BUILD / "firmware.elf"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(*args, cwd=ROOT):
    return subprocess.check_output([str(arg) for arg in args], cwd=cwd, text=True)


baseline = json.loads((ROOT / "firmware/build-receipt.json").read_text())
assert baseline["target"]["buildId"] == 2609051
assert run("git", "rev-parse", "HEAD", cwd=NPB).strip() == baseline["inputs"]["neopixelBus"]["commit"]
header = (NPB / HEADER).read_bytes()
assert sha(header) == "47c69cbd2375c5e0346deb9711706963814cec74f0b6f6c79e4c426e06b83245"
assert sha((SOURCE / "wled00/wled.h").read_bytes()) == "e117af1bd1498e6c34110b6dc2ef00029155b841fb416f139e17201c440fb082"
override = (ROOT / "firmware/wled-platformio.ini").read_bytes()
assert override == (SOURCE / "platformio_override.ini").read_bytes()
assert sha(override) == baseline["inputs"]["platformioOverrideSha256"]

versions = {}
for field, path in [
    ("platformVersion", "platforms/espressif32/platform.json"),
    ("frameworkVersion", "packages/framework-arduinoespressif32/package.json"),
    ("toolchainVersion", "packages/toolchain-xtensa-esp-elf/package.json"),
    ("esptoolVersion", "packages/tool-esptoolpy/package.json"),
]:
    versions[field] = json.loads((CORE / path).read_text())["version"]
    assert versions[field] == baseline["target"][field], field

commands_bytes = (SOURCE / "compile_commands.json").read_bytes()
commands = json.loads(commands_bytes)
bus = next(command for command in commands if command["file"].endswith("wled00/bus_manager.cpp"))
assert "UM_AUDIOREACTIVE_ENABLE" not in json.dumps(bus)
assert not any("/usermods/audioreactive/" in command["file"] or
               command["file"].startswith("usermods/audioreactive/") for command in commands)
assert HEADER in (BUILD / "src/bus_manager.cpp.d").read_text()

symbols = run(BINUTILS / "xtensa-esp32-elf-nm", "-S", "-C", ELF)
pattern = (r"^([0-9a-f]+) ([0-9a-f]+) [tT] "
           r"NeoEsp32RmtMethodBase<NeoEsp32RmtSpeedWs2812x, "
           r"NeoEsp32RmtNotInverted>::Initialize\(\)$")
match = re.search(pattern, symbols, re.MULTILINE)
assert match, "Missing compiled Ws2812x initializer"
start, size = (int(value, 16) for value in match.groups())
assembly = run(BINUTILS / "xtensa-esp32-elf-objdump", "-d", "-C",
               f"--start-address={start}", f"--stop-address={start + size}", ELF)
for literal in ("17701770", "2625a00", "228010", "128020"):
    assert literal in assembly, f"Missing reset/clock/bit timing literal {literal}"
assert "3e803e8" not in assembly, "Old 50us reset remains"
callback = re.search(r"^([0-9a-f]+) [0-9a-f]+ [tT] "
                    r"NeoEsp32RmtMethodBase<NeoEsp32RmtSpeedWs2812x, "
                    r"NeoEsp32RmtNotInverted>::rmt_encode_led_strip\(", symbols, re.MULTILINE)
assert callback and 0x400D0000 <= int(callback[1], 16) < 0x40400000
assert "loo_rmt_encode_led_strip" not in symbols
assert "AudioReactive::" not in symbols and "FFTcode(" not in symbols

artifact = (BUILD / "firmware.bin").read_bytes()
assert artifact[0] == 0xE9 and len(artifact) < 0x1F0000
output = ROOT / "build/firmware-reset-gap"
output.mkdir(exist_ok=True)
name = "wled-nonaudio-reset300-2609093.bin"
shutil.copyfile(BUILD / "firmware.bin", output / name)
(output / "ws2812x-initialize.txt").write_text(assembly)
receipt = {
    "status": "built-not-installed",
    "buildId": 2609093,
    "baselineBuildId": 2609051,
    "baselineImageSha256": baseline["artifact"]["sha256"],
    "wledCommit": baseline["target"]["wledCommit"],
    "neoPixelBusCommit": baseline["inputs"]["neopixelBus"]["commit"],
    "versions": versions,
    "audioCompiled": False,
    "rmtSymbolsPerOutput": 128,
    "rmtClockHz": 40000000,
    "resetMicroseconds": 300,
    "resetSymbolHex": "17701770",
    "initializerAddress": hex(start),
    "refillCallbackAddress": "0x" + callback[1],
    "inputs": {
        "platformioOverrideSha256": sha(override),
        "patchScriptSha256": sha((ROOT / "firmware/reset-gap/patch.mjs").read_bytes()),
        "wledHeaderSha256": sha((SOURCE / "wled00/wled.h").read_bytes()),
        "rmtHeaderSha256": sha(header),
        "compileCommandsSha256": sha(commands_bytes),
        "elfSha256": sha(ELF.read_bytes()),
    },
    "artifact": {"name": name, "byteLength": len(artifact), "sha256": sha(artifact)},
}
receipt_text = json.dumps(receipt, indent=2) + "\n"
(ROOT / "firmware/reset-gap/build-receipt.json").write_text(receipt_text)
(output / "build-receipt.json").write_text(receipt_text)
print(receipt_text)
