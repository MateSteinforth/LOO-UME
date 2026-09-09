#!/usr/bin/env python3
"""Add complete-frame DDP ownership to the guarded 2609095 source."""
import hashlib
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent
HASHES = {
    "e131.cpp": "4deecdd1cc624daa8b5f6eaad31715e63f259fbb52abf1acf54ffb9470e7168b",
    "udp.cpp": "3f7cc1659d5939dd905c23ae245624ad79989d26c5ea8a082cf6294980e06a4d",
    "wled.cpp": "5c3b0bfa58ac8f61f2fee0a9161209b28dd95a6c0536d98b06fdd6b888fb7201",
    "json.cpp": "91f0c1ffb3f8e7131981242735fffb64d56c1dbdb10561c12d7d58df9ce4c0b3",
    "wled.h": "1c2151e3a9f1cabb323fc8a470d58e174b0423d727e9d01e5bace5003f3b0d5e",
    "FX_fcn.cpp": "f5f19b1e443afc11ba3af9892bb30c3e7730d70ae1493653b3165b44858d4a80",
    "FX.h": "6277767cb2137e7e9392a295d867ba65be435a2f0e8a8de2a0756e4c9adf722d",
}


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f"Unexpected patch anchor: {before}")
    return text.replace(before, after)


def apply(source):
    outputs = {}
    for name, expected in HASHES.items():
        data = (source / "wled00" / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Unexpected guarded source: {name}")
        text = data.decode()
        if name == "wled.h":
            text = once(text, "#define VERSION 2609095", "#define VERSION 2609096")
        elif name != "FX.h":
            text = once(text, '#include "wled.h"', '#include "wled.h"\n#include "loo_ddp.h"')
        if name == "FX.h":
            text = once(text, "    void restartRuntime();",
                        "    bool beginDdpFrame();\n    void endDdpFrame();\n    void restartRuntime();")
        if name == "e131.cpp":
            text = once(text,
                "static void handleDDPPacket(e131_packet_t* p, size_t packetLen);",
                "static void handleDDPPacket(e131_packet_t* p, size_t packetLen, IPAddress sender);")
            begin = text.index("static void handleDDPPacket(e131_packet_t* p, size_t packetLen) {")
            end = text.index("//E1.31 and Art-Net protocol support", begin)
            text = text[:begin] + (
                "static void handleDDPPacket(e131_packet_t* p, size_t packetLen, IPAddress sender) {\n"
                "  looDdpReceive(reinterpret_cast<const uint8_t*>(p), packetLen, uint32_t(sender));\n"
                "}\n\n") + text[end:]
            text = once(text, "    realtimeIP = clientIP;\n    handleDDPPacket(p, packetLen);",
                        "    handleDDPPacket(p, packetLen, clientIP);")
        if name == "udp.cpp":
            text = once(text, "void handleNotifications()\n{", "void handleNotifications()\n{\n  looDdpService();")
            text = once(text, "void exitRealtime() {\n  if (!realtimeMode) return;",
                        "void exitRealtime() {\n  if (!realtimeMode) return;\n  if (realtimeMode == REALTIME_MODE_DDP) looDdpExit();")
        if name == "wled.cpp":
            text = once(text, "      strip.service();",
                        "      if (realtimeMode != REALTIME_MODE_DDP || realtimeOverride) strip.service();")
        if name == "FX_fcn.cpp":
            text = once(text, "void WS2812FX::show() {",
                        "bool WS2812FX::beginDdpFrame() {\n"
                        "  if (_suspend || _isServicing || !_pixels) return false;\n"
                        "  _isServicing = true;\n  return true;\n}\n\n"
                        "void WS2812FX::endDdpFrame() { _isServicing = false; }\n\n"
                        "void WS2812FX::show() {")
            text = once(text, "void WS2812FX::finalizeInit() {",
                        "void WS2812FX::finalizeInit() {\n  looDdpReset();")
            text = once(text, "void WS2812FX::show() {",
                        "void WS2812FX::show() {\n  if (!looDdpShowAllowed()) return;\n"
                        "  if (looDdpSubmitting() && _suspend) return;\n"
                        "  if (looDdpSubmitting() && useMainSegmentOnly) getMainSegment().stopTransition();")
            text = once(text, "  BusManager::show();",
                        "  BusManager::show();\n  looDdpDidShow();")
        if name == "json.cpp":
            text = once(text, "void serializeInfo(JsonObject root)\n{",
                        "void serializeInfo(JsonObject root)\n{\n  looDdpJson(root);")
        outputs[name] = text
    for name, text in outputs.items():
        (source / "wled00" / name).write_text(text)
    for name in ("DdpFrames.h", "loo_ddp.h", "loo_ddp.cpp"):
        shutil.copyfile(HERE / name, source / "wled00" / name)


if __name__ == "__main__":
    apply(Path(sys.argv[1]).resolve())
    print("Patched guarded complete-frame DDP candidate 2609096.")
