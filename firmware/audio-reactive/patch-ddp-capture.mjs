import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("Expected one exact capture patch anchor.");
  return source.replace(before, after);
}

export function patchAudioSource(bytes) {
  if (hash(bytes) !== "96ba38dc8702c344e2f39c8b5af53b431972a5e601866f201317e93b5880389f") throw new Error("Unexpected pinned audio source header.");
  let source = bytes.toString("utf8");
  source = replaceOnce(source, "    virtual void deinitialize() = 0;", `    virtual void deinitialize() = 0;
    virtual bool setCaptureEnabled(bool active) = 0;
    virtual bool captureRunning() const = 0;`);
  source = replaceOnce(source, "    virtual void deinitialize() {\n      _initialized = false;", `    bool setCaptureEnabled(bool active) override {
      if (!_initialized) return false;
      if (_captureRunning == active) return true;
      // Legacy stop disables RX DMA and its interrupt; keep buffers and pins for resume.
      esp_err_t err = active ? i2s_start(I2S_NUM_0) : i2s_stop(I2S_NUM_0);
      if (err != ESP_OK) return false;
      _captureRunning = active;
      return true;
    }

    bool captureRunning() const override { return _initialized && _captureRunning; }

    virtual void deinitialize() {
      _initialized = false;
      _captureRunning = false;`);
  source = replaceOnce(source, "#endif\n      _initialized = true;\n    }", "#endif\n      _captureRunning = true;\n      _initialized = true;\n    }");
  source = replaceOnce(source, "    i2s_config_t _config;", "    bool _captureRunning = false;\n    i2s_config_t _config;");
  // A stopped capture must not leave the reader blocked indefinitely.
  source = replaceOnce(source, "&bytes_read, portMAX_DELAY);", "&bytes_read, pdMS_TO_TICKS(50));");
  return Buffer.from(source);
}

export function patchAudioReactive(bytes) {
  if (hash(bytes) !== "aee744f400c9c96f2863ef87ce07be8b10d4df959a7a1be0dc2d074105a799ca") throw new Error("Unexpected pinned AudioReactive source.");
  let source = bytes.toString("utf8");
  source = replaceOnce(source, "if (disableSoundProcessing || (audioSyncEnabled & 0x02)) {", "if (disableSoundProcessing || (audioSyncEnabled & 0x02) || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride)) {");
  source = replaceOnce(source, "    // band pass filter - can reduce noise floor", "    // DDP may have started while the sample read was in progress.\n    if (disableSoundProcessing || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride)) continue;\n\n    // band pass filter - can reduce noise floor");
  source = replaceOnce(source, "      if (!enabled) {\n        disableSoundProcessing = true;", `      // This sculpture gives DDP exclusive use of LED output, even in main-segment mode.
      if (!enabled || updateIsRunning || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride)) {
#ifdef ARDUINO_ARCH_ESP32
        disableSoundProcessing = true;
        if (audioSource && audioSource->isInitialized()) audioSource->setCaptureEnabled(false);
#endif
        disableSoundProcessing = true;`);
  source = replaceOnce(source, "      // We cannot wait indefinitely before processing audio data", `#ifdef ARDUINO_ARCH_ESP32
      if (audioSource && audioSource->isInitialized() && !audioSource->setCaptureEnabled(true)) {
        disableSoundProcessing = true;
        return;
      }
#endif
      // We cannot wait indefinitely before processing audio data`);
  source = replaceOnce(source, "      if (init && FFT_Task) {", `      // Stop capture for manual disable/OTA as well as DDP. Resume before waking FFT.
      if (audioSource && audioSource->isInitialized())
        audioSource->setCaptureEnabled(!init && enabled && !(realtimeMode == REALTIME_MODE_DDP && !realtimeOverride));

      if (init && FFT_Task) {`);
  source = replaceOnce(source, "      if (enabled) disableSoundProcessing = false;  // allows FFT_Task to run at least once, even when loop() might disable again", "      disableSoundProcessing = init || !enabled || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride);");
  source = replaceOnce(source, "      JsonArray infoArr = user.createNestedArray(FPSTR(_name));", `#ifdef ARDUINO_ARCH_ESP32
      JsonArray captureInfo = user.createNestedArray("I2S capture");
      captureInfo.add(!audioSource || !audioSource->isInitialized() ? "unavailable" :
        audioSource->captureRunning() ? "running" :
        (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride) ? "stopped for DDP" : "stopped");
#endif
      JsonArray infoArr = user.createNestedArray(FPSTR(_name));`);
  return Buffer.from(source);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Provide the pinned WLED source directory.");
  for (const [name, patch] of [["audio_source.h", patchAudioSource], ["audio_reactive.cpp", patchAudioReactive]]) {
    const path = resolve(process.argv[2], "usermods/audioreactive", name);
    const patched = patch(await readFile(path));
    await writeFile(path, patched);
    console.log(`${name}: ${hash(patched)}`);
  }
}
