"""Verify the retained driver sources and the custom effect image."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "build/firmware-source"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

baseline = json.loads((HERE.parent / "ddp-expiry/build-receipt.json").read_text())
for name, expected in baseline["inputs"].items():
    content = (SOURCE / name).read_bytes()
    if name == "wled00/wled.h":
        assert content.count(b"#define VERSION 2609101") == 1
        content = content.replace(b"#define VERSION 2609101", b"#define VERSION 2609099")
    elif name == "platformio_override.ini":
        assert content.count(b"custom_usermods = audioreactive equator_wave\n") == 1
        content = content.replace(b"custom_usermods = audioreactive equator_wave\n", b"custom_usermods = audioreactive\n")
    assert hashlib.sha256(content).hexdigest() == expected, name
target = SOURCE / "usermods/equator_wave"
for name in ("EquatorWave.h", "equator_wave.cpp", "library.json"):
    assert (target / name).read_bytes() == (HERE / name).read_bytes(), name
assert (target / "EquatorMapping.h").read_bytes() == (ROOT / "build/equator-mapping/EquatorMapping.h").read_bytes()
runtime = json.loads((ROOT / "web/public/wasm/runtime-integrity.json").read_text())
assert runtime["source"]["equatorWaveHeader"]["sha256"] == sha(HERE / "EquatorWave.h")
commands = json.loads((SOURCE / "compile_commands.json").read_text())
for name in ("equator_wave.cpp", "audio_reactive.cpp", "loo_ddp.cpp"):
    entry = next(item for item in commands if item["file"].endswith(name))
    assert Path(entry["directory"]).resolve() == SOURCE
    flags = entry.get("command", " ".join(entry.get("arguments", [])))
    assert "UM_AUDIOREACTIVE_ENABLE" in flags
    assert str(ROOT / "build/firmware-core") in flags
build = SOURCE / ".pio/build/orbital_esp32dev"
nm = ROOT / "build/firmware-core/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"
symbols = subprocess.check_output([str(nm), "-C", "-S", str(build / "firmware.elf")], text=True)
for name in ("mode_equator_wave", "EquatorWaveUsermod", "FFTcode", "looDdpReset", "loo_rmt_encode_led_strip"):
    assert name in symbols, name
for line in symbols.splitlines():
    if "loo_rmt_encode_led_strip" in line:
        assert 0x40080000 <= int(line.split()[0], 16) < 0x400a0000
image = build / "firmware.bin"
assert image.read_bytes()[0] == 0xe9 and image.stat().st_size < 0x180000
output = ROOT / "build/firmware-equator-wave"
output.mkdir(exist_ok=True)
artifact = output / "wled-equator-wave-2609101.bin"
shutil.copyfile(image, artifact)
receipt = {
    "buildId": 2609101,
    "baselineBuildId": 2609099,
    "baselineArtifactSha256": baseline["artifact"]["sha256"],
    "status": "build-verified; not installed",
    "effectName": "Equator Wave",
    "mapping": json.loads((ROOT / "build/equator-mapping/mapping-receipt.json").read_text()),
    "inputs": {str(path.relative_to(ROOT)): sha(path) for path in sorted(HERE.iterdir()) if path.suffix in (".h", ".cpp", ".py")},
    "userModInputs": {path.name: sha(path) for path in sorted(target.iterdir()) if path.is_file()},
    "elfSha256": sha(build / "firmware.elf"),
    "compileCommandsSha256": sha(SOURCE / "compile_commands.json"),
    "artifact": {"name": artifact.name, "byteLength": artifact.stat().st_size, "sha256": sha(artifact)},
    "physicalAcceptance": "Pending mapping verification and attended simulator, microphone, DDP, and mode-transition checks.",
}
(HERE / "build-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt["artifact"]))
