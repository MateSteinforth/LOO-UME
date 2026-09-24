#!/usr/bin/env python3
"""Compile the FIRM-044 DDP service and timing code with a deterministic WLED host boundary."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # Do not leave __pycache__ in the tracked firmware directories.
# Reuse the FIRM-040 extraction of the actual receiver, lifecycle, and show prefix and suffix.
_spec = importlib.util.spec_from_file_location("ddp_service", HERE.parent / "ddp-dma" / "test-service.py")
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

STATE_CONTROL = (
    'looDdpControl(overlap.is<bool>() ? int(overlap.as<bool>()) : -1, looDdp[F("reset")] | false);'
)


def require_control(source: Path) -> None:
    text = (source / "json.cpp").read_text()
    if STATE_CONTROL not in text or "if (!presetId) {" not in text:
        raise RuntimeError("Missing FIRM-044 state control in json.cpp.")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: test-service.py /path/to/build/firmware-source")
    source = Path(sys.argv[1]).resolve() / "wled00"
    base.require_integrations(source)
    require_control(source)
    compiler = shutil.which("g++")
    if compiler is None:
        raise RuntimeError("g++ is required for the DDP service harness.")
    with tempfile.TemporaryDirectory(prefix="loo-ddp-timing-") as directory:
        out = Path(directory)
        (out / "wled.h").write_text((HERE / "fake-wled.h").read_text())
        for name in ("fake-wled.h", "service-harness.cpp"):
            shutil.copyfile(HERE / name, out / name)
        for name in ("DdpFrames.h", "loo_ddp.h", "loo_ddp.cpp"):
            shutil.copyfile(source / name, out / name)
        (out / "loo_dma_status.h").write_text((source / "loo_dma_status.h").read_text())
        (out / "extracted-ddp-handler.inc").write_text(base.extracted_handler(source / "e131.cpp"))
        (out / "extracted-lifecycle.inc").write_text(base.extracted_lifecycle(source))
        command = [
            compiler, "-std=c++20", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined",
            "-fno-omit-frame-pointer", "-I", str(out),
            str(out / "service-harness.cpp"), str(out / "loo_ddp.cpp"), "-o", str(out / "service-harness"),
        ]
        subprocess.run(command, check=True)
        environment = {"ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"}
        subprocess.run([str(out / "service-harness")], check=True, env=environment)
    print("FIRM-044 service harness passed: 2609099 scenarios, overlap, replacement causes, and timing.")


if __name__ == "__main__":
    main()
