#!/usr/bin/env python3
"""Add DDP presentation timing and the RMT overlap switch to an exact 2609099 source copy."""
import hashlib
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent
# Exact 2609099 inputs from firmware/ddp-expiry/build-receipt.json.
HASHES = {
    "wled00/DdpFrames.h": "f905c3dd724cbc77be3e63374987ff2c548eb0dc6f64f223e046bc7ff5b6b8e4",
    "wled00/loo_ddp.h": "d7513996ec21f6ebc9394c3341bda9a90b85c19ad6e231fb2dd3ca2df07b94b9",
    "wled00/loo_ddp.cpp": "0b3fb10b72f192c30c44ce430b4c96573b74ea017e8781749af0048e578d6268",
    "wled00/json.cpp": "f836e8aef8fd1ab8e044e0909f2cee6006df6d49f21944d8cc2ed464a2afcd73",
    "wled00/wled.h": "20a9ef2c759b8b46041f325e780ed482ec48e202ed97b70ed620e9b9da70cd75",
}
COPIED = ("DdpFrames.h", "loo_ddp.h", "loo_ddp.cpp")
STATE_HOOK = """  if (!presetId) {
    // FIRM-044 runtime diagnostics. Presets cannot change them.
    JsonObject looDdp = root[F("loo_ddp")];
    if (!looDdp.isNull()) {
      JsonVariant overlap = looDdp[F("overlap")];
      looDdpControl(overlap.is<bool>() ? int(overlap.as<bool>()) : -1, looDdp[F("reset")] | false);
    }
  }
"""


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f"Unexpected source anchor: {before}")
    return text.replace(before, after)


def apply(source):
    outputs = {}
    for name, digest in HASHES.items():
        data = (source / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Unexpected source: {name}")
        outputs[name] = data.decode()
    name = "wled00/json.cpp"
    outputs[name] = once(outputs[name],
        "bool deserializeState(JsonObject root, byte callMode, byte presetId)\n{\n",
        "bool deserializeState(JsonObject root, byte callMode, byte presetId)\n{\n" + STATE_HOOK)
    name = "wled00/wled.h"
    outputs[name] = once(outputs[name], "#define VERSION 2609099", "#define VERSION 2609103")
    for name in ("wled00/json.cpp", "wled00/wled.h"):
        (source / name).write_text(outputs[name])
    for name in COPIED:
        shutil.copyfile(HERE / name, source / "wled00" / name)


if __name__ == "__main__":
    apply(Path(sys.argv[1]).resolve())
    print("Patched DDP presentation timing candidate 2609103.")
