import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { patchAudioSource, patchAudioReactive } from "./patch-ddp-capture.mjs";

const root = resolve(import.meta.dirname, "../..");
const archive = resolve(root, "build/wled-source.tar.gz");
const prefix = "WLED-d9b9a846561227351ad929e3109781daadb7bed2/usermods/audioreactive/";
const original = name => execFileSync("tar", ["-xOf", archive, prefix + name]);
const source = patchAudioSource(original("audio_source.h"));
const audio = patchAudioReactive(original("audio_reactive.cpp"));
for (const [name, expected, patch] of [["audio_source.h", source, patchAudioSource], ["audio_reactive.cpp", audio, patchAudioReactive]]) {
  assert.deepEqual(readFileSync(resolve(root, "build/firmware-source/usermods/audioreactive", name)), expected);
  assert.throws(() => patch(expected));
  assert.throws(() => patch(Buffer.from("unexpected source")));
}

// Exercise the actual patched C++ capture methods against a driver stub.
const methods = source.toString().split("    bool setCaptureEnabled(bool active) override {")[1].split("    virtual void deinitialize() {")[0];
assert.ok(methods);
const directory = resolve(root, "build/capture-host-test");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "capture.cpp"), `
#include <cassert>
using esp_err_t = int;
constexpr int ESP_OK = 0, I2S_NUM_0 = 0;
int starts = 0, stops = 0, result = ESP_OK;
int i2s_start(int) { ++starts; return result; }
int i2s_stop(int) { ++stops; return result; }
struct Interface { virtual bool setCaptureEnabled(bool) = 0; virtual bool captureRunning() const = 0; };
struct Capture : Interface {
  bool _initialized = false, _captureRunning = false;
  bool setCaptureEnabled(bool active) override {${methods}
};
int main() {
  Capture c;
  assert(!c.setCaptureEnabled(true) && starts == 0);
  c._initialized = c._captureRunning = true;
  assert(c.setCaptureEnabled(true) && starts == 0);
  assert(c.setCaptureEnabled(false) && !c.captureRunning() && stops == 1);
  assert(c.setCaptureEnabled(false) && stops == 1);
  assert(c.setCaptureEnabled(true) && c.captureRunning() && starts == 1);
  result = -1;
  assert(!c.setCaptureEnabled(false) && c.captureRunning());
  result = ESP_OK;
  assert(c.setCaptureEnabled(false) && !c.captureRunning());
  result = -1;
  assert(!c.setCaptureEnabled(true) && !c.captureRunning());
  result = ESP_OK;
  for (int i=0; i<100; ++i) {
    assert(c.setCaptureEnabled(true) && c.captureRunning());
    assert(c.setCaptureEnabled(false) && !c.captureRunning());
  }
}
`);
execFileSync("g++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", resolve(directory, "capture.cpp"), "-o", resolve(directory, "capture-test")]);
execFileSync(resolve(directory, "capture-test"));
console.log("Pinned patches verified; capture stop/start, repeated calls, driver failures and 100 switching cycles passed.");
