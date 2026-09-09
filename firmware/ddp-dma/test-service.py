#!/usr/bin/env python3
"""Compile the current DDP service with a deterministic WLED host boundary."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


HERE = Path(__file__).resolve().parent


def extracted_handler(source: Path) -> str:
    text = source.read_text()
    match = re.search(
        r"static void handleDDPPacket\(e131_packet_t\* p, size_t packetLen, IPAddress sender\) \{\n"
        r"(.*?)\n\}\n\n//E1\.31",
        text,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError("The patched DDP receiver was not found.")
    body = match.group(0).removesuffix("\n\n//E1.31")
    if "looDdpReceive(reinterpret_cast<const uint8_t*>(p), packetLen, uint32_t(sender));" not in body:
        raise RuntimeError("The receiver no longer passes exact packet bytes and sender identity.")
    return body


def require_integrations(source: Path) -> None:
    files = {
        "udp.cpp": ("looDdpService();", "if (realtimeMode == REALTIME_MODE_DDP) looDdpExit();"),
        "wled.cpp": ("realtimeMode != REALTIME_MODE_DDP || realtimeOverride",),
        "FX_fcn.cpp": (
            "looDdpReset();", "if (!looDdpShowAllowed()) return;",
            "bool WS2812FX::beginDdpFrame()",
            "if (looDdpSubmitting() && _suspend) return;",
            "if (looDdpSubmitting() && useMainSegmentOnly) getMainSegment().stopTransition();",
            "looDdpDidShow();",
        ),
    }
    for name, markers in files.items():
        text = (source / name).read_text()
        if not all(marker in text for marker in markers):
            raise RuntimeError(f"Missing current DDP integration in {name}.")


def function_body(text: str, signature: str) -> str:
    start = text.index(signature)
    brace = text.index("{", start)
    depth = 0
    for index in range(brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise RuntimeError(f"Unterminated function: {signature}")


def extracted_lifecycle(source: Path) -> str:
    udp = (source / "udp.cpp").read_text()
    fx = (source / "FX_fcn.cpp").read_text()
    lock = function_body(udp, "void realtimeLock(uint32_t timeoutMs, byte md)")
    exit_ = function_body(udp, "void exitRealtime()")
    notification_start = udp.index("void handleNotifications()")
    notification_end = udp.index("  //receive UDP notifications", notification_start)
    prefix = udp[notification_start:notification_end]
    prefix = prefix.replace("void handleNotifications()", "static void actualNotificationPrefix()", 1)
    prefix += "}\n"
    show = function_body(fx, "void WS2812FX::show()")
    prefix_end = show.index("  if (!_pixels)")
    show_prefix = show[show.index("{") + 1:prefix_end]
    show_prefix = show_prefix.replace("if (!looDdpShowAllowed()) return;", "if (!looDdpShowAllowed()) return false;")
    show_prefix = show_prefix.replace("getMainSegment()", "strip.getMainSegment()")
    show_prefix = show_prefix.replace("_suspend", "strip.suspended")
    show_prefix = show_prefix.replace("if (looDdpSubmitting() && strip.suspended) return;", "if (looDdpSubmitting() && strip.suspended) return false;")
    begin = function_body(fx, "bool WS2812FX::beginDdpFrame()")
    end = function_body(fx, "void WS2812FX::endDdpFrame()")
    begin = begin.replace("WS2812FX::", "FakeStrip::").replace("_suspend", "suspended")
    begin = begin.replace("_isServicing", "servicing").replace("_pixels", "pixelsAvailable")
    end = end.replace("WS2812FX::", "FakeStrip::").replace("_isServicing", "servicing")
    pixel = function_body(udp, "void setRealtimePixel(uint16_t i, byte r, byte g, byte b, byte w)")
    suffix_start = show.index("  BusManager::show();")
    suffix = show[suffix_start:show.index("\n", show.index("looDdpDidShow();", suffix_start)) + 1]
    return (
        lock + "\n\n" + exit_ + "\n\n" + prefix + "\n" + pixel + "\n\n" + begin + "\n" + end + "\n\n"
        + "static bool actualShowPrefix() {\n" + show_prefix + "  return true;\n}\n\n"
        + "static void actualShowSuffix() {\n" + suffix + "}\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: test-service.py /path/to/build/firmware-source")
    source = Path(sys.argv[1]).resolve() / "wled00"
    require_integrations(source)
    compiler = shutil.which("g++")
    if compiler is None:
        raise RuntimeError("g++ is required for the DDP service harness.")
    with tempfile.TemporaryDirectory(prefix="loo-ddp-service-") as directory:
        out = Path(directory)
        (out / "wled.h").write_text((HERE / "fake-wled.h").read_text())
        for name in ("fake-wled.h", "service-harness.cpp"):
            shutil.copyfile(HERE / name, out / name)
        for name in ("DdpFrames.h", "loo_ddp.h", "loo_ddp.cpp"):
            shutil.copyfile(source / name, out / name)
        (out / "loo_dma_status.h").write_text((source / "loo_dma_status.h").read_text())
        (out / "extracted-ddp-handler.inc").write_text(extracted_handler(source / "e131.cpp"))
        (out / "extracted-lifecycle.inc").write_text(extracted_lifecycle(source))
        command = [
            compiler, "-std=c++20", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined",
            "-fno-omit-frame-pointer", "-I", str(out), "-I", str(HERE),
            str(out / "service-harness.cpp"), str(out / "loo_ddp.cpp"), "-o", str(out / "service-harness"),
        ]
        subprocess.run(command, check=True)
        environment = {"ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"}
        subprocess.run([str(out / "service-harness")], check=True, env=environment)
    print("DDP service harness passed: ownership, pacing, recovery, and guarded-DMA paths.")


if __name__ == "__main__":
    main()
