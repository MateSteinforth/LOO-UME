#!/usr/bin/env python3
"""Apply the measurement hooks to an isolated, verified2609093 source tree."""
from pathlib import Path
import hashlib
import shutil

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "build/firmware-source"
NPB = SOURCE / ".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575"


def pinned(path, expected):
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, f"Unexpected source: {path}"
    return data.decode()


def once(source, old, new):
    assert source.count(old) == 1, f"Expected one match: {old[:100]}"
    return source.replace(old, new)


header_path = NPB / "src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h"
header = pinned(header_path, "47c69cbd2375c5e0346deb9711706963814cec74f0b6f6c79e4c426e06b83245")
header = once(header, "#define NEOPIXELBUS_RMT_INT_FLAGS", '#include "loo_rmt_probe.h"\n\n#define NEOPIXELBUS_RMT_INT_FLAGS')
header = once(header, "        free(_dataEditing);", "        loo_probe_forget(_pin);\n        free(_dataEditing);")
header = once(header,
    "        if (ESP_OK == ESP_ERROR_CHECK_WITHOUT_ABORT(rmt_tx_wait_all_done(_channel, 10000 / portTICK_PERIOD_MS)))",
    "        esp_err_t loo_wait = ESP_ERROR_CHECK_WITHOUT_ABORT(rmt_tx_wait_all_done(_channel, 10000 / portTICK_PERIOD_MS));\n"
    "        loo_probe_wait_result(_pin, loo_wait);\n        if (ESP_OK == loo_wait)")
header = once(header,
    "            rmt_transmit(_channel, _led_encoder, _dataEditing, _sizeData, &_tx_config); // 3 for _sizeData",
    "            loo_probe_before(_pin, _dataEditing, _sizeData);\n"
    "            esp_err_t loo_result = rmt_transmit(_channel, _led_encoder, _dataEditing, _sizeData, &_tx_config);\n"
    "            loo_probe_result(_pin, loo_result);")
json_path = SOURCE / "wled00/json.cpp"
json_source = pinned(json_path, "91f0c1ffb3f8e7131981242735fffb64d56c1dbdb10561c12d7d58df9ce4c0b3")
json_source = once(json_source, '#include "wled.h"',
    '#include "wled.h"\nvoid looProbeRead(JsonObject root);\nvoid looProbeInfo(JsonObject root);')
json_source = once(json_source, "  bool stateResponse = root[F(\"v\")] | false;",
    "  looProbeRead(root);\n  bool stateResponse = root[F(\"v\")] | false;")
json_source = once(json_source, "void serializeInfo(JsonObject root)\n{",
    "void serializeInfo(JsonObject root)\n{\n  looProbeInfo(root);")
wled_path = SOURCE / "wled00/wled.h"
wled = pinned(wled_path, "e117af1bd1498e6c34110b6dc2ef00029155b841fb416f139e17201c440fb082")
wled = once(wled, "#define VERSION 2609093", "#define VERSION 2609094")

for path, content in [(header_path, header), (json_path, json_source), (wled_path, wled)]:
    path.write_text(content)
for name in ("loo_rmt_probe.h", "loo_rmt_probe.c", "loo_rmt_probe_json.cpp"):
    shutil.copyfile(ROOT / "firmware/rmt-probe" / name, SOURCE / "wled00" / name)
print("Applied task-context integrity hooks and runtime telemetry API; IDF probe still required.")
