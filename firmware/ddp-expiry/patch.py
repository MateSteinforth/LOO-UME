#!/usr/bin/env python3
"""Correct stale-clock expiry in the combined DMA and audio candidate."""
import hashlib
from pathlib import Path
import sys

HASHES = {
    "wled00/DdpFrames.h": "7a88e26fb81836de790cb32e8eb6efb179b18f72ba8a5f8cf12ceb51686be756",
    "wled00/wled.h": "16d334fc85a31946a0d301fbee17b3658e3577ad80a829999c61a8d82e2dba83",
}


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
    name = "wled00/DdpFrames.h"
    outputs[name] = once(outputs[name],
        "  void expireLocked(uint32_t nowUs, uint32_t timeoutUs) {",
        """  static bool timedOut(uint32_t now, uint32_t then, uint32_t timeout) {
    const uint32_t age = elapsed(now, then);
    // A pre-lock time sample can precede a newer protected timestamp.
    // Queue lifetimes are bounded to 100 ms, far below half the clock range.
    return age < 0x80000000u && age >= timeout;
  }
  void expireLocked(uint32_t nowUs, uint32_t timeoutUs) {""")
    outputs[name] = once(outputs[name],
        "elapsed(nowUs, lastAssemblyUs_) >= timeoutUs",
        "timedOut(nowUs, lastAssemblyUs_, timeoutUs)")
    outputs[name] = once(outputs[name],
        "elapsed(nowUs, readyAtUs_) >= timeoutUs",
        "timedOut(nowUs, readyAtUs_, timeoutUs)")
    outputs["wled00/wled.h"] = once(outputs["wled00/wled.h"],
        "#define VERSION 2609098", "#define VERSION 2609099")
    for name, text in outputs.items():
        (source / name).write_text(text)


if __name__ == "__main__":
    apply(Path(sys.argv[1]))
