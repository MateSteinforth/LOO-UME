import {createHash} from 'node:crypto';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected anchor: '+a);return s.replace(a,b);}
export function patchSource(bytes){
 if(hash(bytes)!=='96ba38dc8702c344e2f39c8b5af53b431972a5e601866f201317e93b5880389f')throw Error('Unexpected audio source');
 let s=bytes.toString();
 s=once(s,'    virtual void deinitialize() = 0;','    virtual void deinitialize() = 0;\n    virtual bool deepSetDriver(bool) { return false; }');
 s=once(s,'    virtual void deinitialize() {\n      _initialized = false;',`    // Called only by the FFT worker outside getSamples. Keep pin reservations.
    bool deepSetDriver(bool active) override {
      if (_initialized == active) return true;
      if (!active) {
        if (i2s_driver_uninstall(I2S_NUM_0) != ESP_OK) return false;
        _initialized = false;
        return true;
      }
      if (i2s_driver_install(I2S_NUM_0, &_config, 0, nullptr) != ESP_OK) return false;
      if (i2s_set_pin(I2S_NUM_0, &_pinConfig) != ESP_OK ||
          i2s_set_clk(I2S_NUM_0, _sampleRate, I2S_SAMPLE_RESOLUTION, I2S_CHANNEL_MONO) != ESP_OK) {
        // A failed cleanup leaves a driver allocated: remember this so the next
        // off request attempts uninstall rather than incorrectly claiming off.
        _initialized = i2s_driver_uninstall(I2S_NUM_0) != ESP_OK;
        return false;
      }
      _initialized = true;
      return true;
    }

    virtual void deinitialize() {
      _initialized = false;`);
 s=once(s,'&bytes_read, portMAX_DELAY);','&bytes_read, pdMS_TO_TICKS(50));');
 return Buffer.from(s);
}
export function patchAudio(bytes){
 if(hash(bytes)!=='aee744f400c9c96f2863ef87ce07be8b10d4df959a7a1be0dc2d074105a799ca')throw Error('Unexpected audio implementation');
 let s=bytes.toString();
 s=once(s,'#include "wled.h"','#include "wled.h"\n#include "DeepAudioSleep.h"');
 s=once(s,'static TaskHandle_t FFT_Task = nullptr;',`static TaskHandle_t FFT_Task = nullptr;
static DeepAudioSleep deepAudio;
static void requestDeepAudio(bool off) {
  if (deepAudio.request(off) && FFT_Task) xTaskNotifyGive(FFT_Task);
}`);
 s=once(s,'    // Don\'t run FFT computing code if we\'re in Receive mode or in realtime mode',`    // Complete the prior sample/FFT batch before touching the driver. A pending
    // notification survives the gap between request checking and blocking.
    if (audioSource && !deepAudio.service(*audioSource)) {
      ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
      xLastWakeTime = xTaskGetTickCount();
      continue;
    }

    // Don't run FFT computing code if we're in Receive mode or in realtime mode`);
 s=once(s,'      static unsigned long lastUMRun = millis();',`      static unsigned long lastUMRun = millis();
#ifdef ARDUINO_ARCH_ESP32
      const bool deepOff = !enabled || updateIsRunning || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride);
      requestDeepAudio(deepOff);
      if (deepOff || deepAudio.state() != DeepAudioSleep::Running) {
        disableSoundProcessing = true;
        lastUMRun = millis();
        return;
      }
#endif`);
 const start=s.indexOf('    void onUpdateBegin(bool init) override\n');
 const end=s.indexOf('\n#else // reduced function for 8266',start);
 if(start<0||end<0)throw Error('Unexpected update lifecycle');
 s=s.slice(0,start)+`    void onUpdateBegin(bool init) override
    {
      updateIsRunning = init;
      disableSoundProcessing = true;
      const bool off = init || !enabled || (realtimeMode == REALTIME_MODE_DDP && !realtimeOverride);
      requestDeepAudio(off);
      if (!FFT_Task && !init && enabled) {
        xTaskCreateUniversal(FFTcode, "FFT", 3592, NULL, FFTTASK_PRIORITY, &FFT_Task, 0);
      }
      if (off && udpSyncConnected) { udpSyncConnected = false; fftUdp.stop(); }
      // Worker owns all driver transitions; never suspend it inside an I2S read.
      if (!off) connected();
    }
`+s.slice(end);
 s=once(s,'      JsonArray infoArr = user.createNestedArray(FPSTR(_name));',`#ifdef ARDUINO_ARCH_ESP32
      JsonArray deepInfo = user.createNestedArray("Audio driver");
      deepInfo.add(deepAudio.state() == DeepAudioSleep::Unloaded ? "unloaded" :
        deepAudio.state() == DeepAudioSleep::Fault ? "transition failed" : "installed");
      JsonArray taskInfo = user.createNestedArray("FFT task");
      taskInfo.add(!FFT_Task ? "absent" : eTaskGetState(FFT_Task) == eBlocked ? "blocked" : "scheduled");
#endif
      JsonArray infoArr = user.createNestedArray(FPSTR(_name));`);
 return Buffer.from(s);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(process.argv[2],'usermods/audioreactive');
 for(const [file,fn] of [['audio_source.h',patchSource],['audio_reactive.cpp',patchAudio]]){
  const p=resolve(root,file),b=fn(await readFile(p));await writeFile(p,b);console.log(file,hash(b));
 }
 await copyFile(new URL('./DeepAudioSleep.h',import.meta.url),resolve(root,'DeepAudioSleep.h'));
}
