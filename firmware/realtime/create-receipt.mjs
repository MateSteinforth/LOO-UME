import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,copyFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"../.."), source=resolve(root,"build/firmware-source"),core=resolve(root,"build/firmware-toolchain/core");
const build=Number(process.argv[2]); assert.ok([2609083,2609084].includes(build));
const audio=build===2609084;
const hash=b=>createHash("sha256").update(b).digest("hex");
const json=async p=>JSON.parse(await readFile(p,"utf8"));
const baseline=await json(resolve(root,"firmware/build-receipt.json"));
assert.equal(hash(await readFile(resolve(root,"build/wled-source.tar.gz"))),"42f12c1b286030301dde811079386e99cbe6590989c7b45daa323bb0495fa8d1");
for(const [key,path] of [["platformVersion","platforms/espressif32/platform.json"],["frameworkVersion","packages/framework-arduinoespressif32/package.json"],["toolchainVersion","packages/toolchain-xtensa-esp-elf/package.json"],["esptoolVersion","packages/tool-esptoolpy/package.json"]]) assert.equal((await json(resolve(core,path))).version,baseline.target[key]);
const override=await readFile(resolve(source,"platformio_override.ini"));
assert.deepEqual(override,await readFile(resolve(root,audio?"firmware/audio-reactive/platformio.ini":"firmware/wled-platformio.ini")));
const header=await readFile(resolve(source,"wled00/wled.h"),"utf8");assert.ok(header.includes(`#define VERSION ${build}`));
const dep=resolve(source,".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575");
assert.equal(execFileSync("git",["rev-parse","HEAD"],{cwd:dep,encoding:"utf8"}).trim(),baseline.inputs.neopixelBus.commit);
const rmt=await readFile(resolve(dep,baseline.inputs.neopixelBus.header));
const originalRmt=audio?Buffer.from(rmt.toString().replace("static size_t IRAM_ATTR rmt_encode_led_strip(","static size_t rmt_encode_led_strip(")):rmt;
assert.equal(hash(originalRmt),baseline.inputs.neopixelBus.patchedHeaderSha256);
const elf=resolve(source,".pio/build/orbital_esp32dev/firmware.elf");
const symbols=execFileSync(resolve(core,"packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"),["-C",elf],{encoding:"utf8",maxBuffer:16*1024*1024});
// LTO may inline the receive/service wrappers; verify the retained pool and build input.
assert.ok(symbols.includes("LooDdpFrames"));
assert.ok((await readFile(resolve(source,"compile_commands.json"),"utf8")).includes("loo_ddp.cpp"));
assert.equal(symbols.includes("AudioReactive::setup()"),audio);
if(audio) {
  const callbacks=symbols.split("\n").filter(s=>s.includes("rmt_encode_led_strip")||/\brmt_encode_(bytes|copy)$/.test(s));
  assert.ok(callbacks.length>=3);
  for(const s of callbacks) {const address=parseInt(s.slice(0,8),16);assert.ok(address>=0x40080000&&address<0x400a0000,`Callback outside IRAM: ${s}`);}
}
const hashes={};
for(const name of ["e131.cpp","udp.cpp","wled.cpp","wled.h","json.cpp","DdpFrames.h","loo_ddp.cpp","loo_ddp.h"]) hashes[name]=hash(await readFile(resolve(source,"wled00",name)));
for(const name of ["DdpFrames.h","loo_ddp.cpp","loo_ddp.h"]) assert.equal(hashes[name],hash(await readFile(resolve(import.meta.dirname,name))));
const output=resolve(root,`build/realtime-${build}`);await mkdir(output,{recursive:true});
const bin=await readFile(resolve(source,".pio/build/orbital_esp32dev/firmware.bin"));
await writeFile(resolve(output,`wled-${build}.bin`),bin);
await copyFile(elf,resolve(output,"firmware.elf"));
const receipt={build,baselineWledCommit:baseline.target.wledCommit,audio,frameBufferBytes:3*2624*3,rmtHeaderSha256:hash(rmt),overrideSha256:hash(override),sourceHashes:hashes,elfSha256:hash(await readFile(elf)),artifact:{name:`wled-${build}.bin`,byteLength:bin.length,sha256:hash(bin)},status:"built; physical result pending"};
await writeFile(resolve(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
await writeFile(resolve(import.meta.dirname,`receipt-${build}.json`),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
