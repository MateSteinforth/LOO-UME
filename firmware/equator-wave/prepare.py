"""Add the shared monochrome audio effects to verified firmware 2609099."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent
source = Path(sys.argv[1]).resolve()
mapping = Path(sys.argv[2]).resolve()
receipt = json.loads((HERE.parent / "ddp-expiry/build-receipt.json").read_text())
for name, expected in receipt["inputs"].items():
    actual = hashlib.sha256((source / name).read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"Baseline source mismatch: {name}")
version = source / "wled00/wled.h"
text = version.read_text()
if text.count("#define VERSION 2609099") != 1:
    raise ValueError("Expected firmware 2609099.")
override = source / "platformio_override.ini"
config = override.read_text()
if config.count("custom_usermods = audioreactive\n") != 1:
    raise ValueError("Expected the accepted audio usermod selection.")
mapping_receipt = json.loads((mapping / "mapping-receipt.json").read_text())
if mapping_receipt["ledCount"] != 2624:
    raise ValueError("Expected 2,624 mapping coordinates.")
target = source / "usermods/equator_wave"
if target.exists():
    raise ValueError("The effect directory already exists.")
target.mkdir()
for name in ("EquatorWave.h", "GlitchAudio.h", "equator_wave.cpp", "library.json"):
    shutil.copyfile(HERE / name, target / name)
shutil.copyfile(mapping / "EquatorMapping.h", target / "EquatorMapping.h")
version.write_text(text.replace("#define VERSION 2609099", "#define VERSION 2609102"))
override.write_text(config.replace("custom_usermods = audioreactive\n", "custom_usermods = audioreactive equator_wave\n"))
print("Prepared firmware 2609102. RMT, DDP, and audio source files are unchanged.")
