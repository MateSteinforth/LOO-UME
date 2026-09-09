#!/usr/bin/env python3
"""Execute the actual three-step mono-buffer classes with injected failures."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("dma_patch", HERE / "patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
source = Path(sys.argv[1])
with tempfile.TemporaryDirectory() as directory:
    target = Path(directory)
    for relative, digest in patch.FILES.values():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, path)
    patch.apply(target)
    text = (target / patch.FILES["method"][0]).read_text()
    start = text.index("class NeoEspI2sMuxBusSize8Bit3Step")
    end = text.index("#if defined(NPB_CONF_4STEP_CADENCE)", start)
    harness = (HERE / "method-harness.cpp").read_text()
    assert harness.count("// ACTUAL_CLASSES") == 1
    program = target / "test.cpp"
    program.write_text(harness.replace("// ACTUAL_CLASSES", text[start:end]))
    binary = target / "test"
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", str(program), "-o", str(binary)], check=True)
    environment = dict(os.environ)
    # Allocation accounting replaces LeakSanitizer under host process tracing.
    environment["ASAN_OPTIONS"] = environment.get("ASAN_OPTIONS", "") + ":detect_leaks=0"
    subprocess.run([str(binary)], check=True, env=environment)
