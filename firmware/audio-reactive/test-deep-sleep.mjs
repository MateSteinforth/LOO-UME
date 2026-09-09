import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {patchSource,patchAudio} from './patch-deep-sleep.mjs';
const root=resolve(import.meta.dirname,'../..');
const original=name=>execFileSync('tar',['-xOf',resolve(root,'build/wled-source.tar.gz'),'WLED-d9b9a846561227351ad929e3109781daadb7bed2/usermods/audioreactive/'+name]);
for(const [file,fn] of [['audio_source.h',patchSource],['audio_reactive.cpp',patchAudio]]){
 const patched=fn(original(file));assert.deepEqual(patched,readFileSync(resolve(root,'build/firmware-source/usermods/audioreactive',file)));
 assert.throws(()=>fn(patched));assert.throws(()=>fn(Buffer.from('unexpected')));
}
const header=patchSource(original('audio_source.h')).toString();
const methods=header.slice(header.indexOf('    bool deepSetDriver(bool active) override {'),header.indexOf('    virtual void deinitialize() {'));
assert.ok(methods.includes('i2s_driver_uninstall'));
const dir=resolve(root,'build/deep-host-test');mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir,'test.cpp'),`
#include <cassert>
#include "${resolve(root,'firmware/audio-reactive/DeepAudioSleep.h')}"
constexpr int ESP_OK=0,I2S_NUM_0=0,I2S_SAMPLE_RESOLUTION=32,I2S_CHANNEL_MONO=1;
int installs=0,uninstalls=0,installError=0,uninstallError=0,pinError=0,clockError=0;
int i2s_driver_install(int,void*,int,void*){++installs;return installError;}
int i2s_driver_uninstall(int){++uninstalls;return uninstallError;}
int i2s_set_pin(int,void*){return pinError;}
int i2s_set_clk(int,int,int,int){return clockError;}
struct Base {virtual bool deepSetDriver(bool)=0;};
struct Source:Base {bool _initialized=true;int _config=0,_pinConfig=0,_sampleRate=22050;${methods}};
int main(){
 Source s;DeepAudioSleep control;
 assert(control.service(s)&&installs==0&&uninstalls==0);
 for(int i=0;i<1000;i++){
  assert(control.request(true));assert(!control.request(true));
  assert(!control.service(s));assert(control.state()==DeepAudioSleep::Unloaded&&!s._initialized);
  int n=uninstalls;assert(!control.service(s)&&uninstalls==n);
  assert(control.request(false));assert(control.service(s)&&s._initialized);
 }
 assert(installs==1000&&uninstalls==1000);
 // Uninstall failure must never report unloaded.
 control.request(true);uninstallError=-1;assert(!control.service(s));assert(control.state()==DeepAudioSleep::Fault&&s._initialized);
 uninstallError=0;assert(!control.service(s));assert(control.state()==DeepAudioSleep::Unloaded);
 control.request(false);installError=-1;assert(!control.service(s)&&!s._initialized);assert(control.state()==DeepAudioSleep::Fault);
 installError=0;pinError=-1;assert(!control.service(s)&&!s._initialized);
 pinError=0;clockError=-1;assert(!control.service(s)&&!s._initialized);
 // Failed rollback tracks the still-installed driver for the next off request.
 uninstallError=-1;assert(!control.service(s)&&s._initialized);
 uninstallError=clockError=0;control.request(true);assert(!control.service(s)&&!s._initialized);
 control.request(false);assert(control.service(s));
 // Coalesced request edges are safe: only the final desired state matters.
 control.request(true);control.request(false);int n=uninstalls;assert(control.service(s)&&uninstalls==n);
}
`);
execFileSync('g++',['-std=c++17','-Wall','-Wextra','-Werror',resolve(dir,'test.cpp'),'-o',resolve(dir,'test')]);execFileSync(resolve(dir,'test'));
console.log('Exact patches and actual C++ lifecycle/driver methods passed 1000 cycles, repeated requests, coalesced edges, install/uninstall/pin/clock/cleanup failures.');
