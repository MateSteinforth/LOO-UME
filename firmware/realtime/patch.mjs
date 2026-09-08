import {createHash} from "node:crypto";
import {readFile,writeFile,copyFile} from "node:fs/promises";
import {resolve} from "node:path";
const source=process.argv[2], build=Number(process.argv[3]);
if (!source || ![2609083,2609084].includes(build)) throw new Error("Provide pinned source and build 2609083 or 2609084.");
const hash=b=>createHash("sha256").update(b).digest("hex");
function once(s,a,b) { if(s.split(a).length!==2) throw new Error(`Patch anchor: ${a}`); return s.replace(a,b); }
const originals={
  "e131.cpp":"4deecdd1cc624daa8b5f6eaad31715e63f259fbb52abf1acf54ffb9470e7168b",
  "udp.cpp":"3f7cc1659d5939dd905c23ae245624ad79989d26c5ea8a082cf6294980e06a4d",
  "json.cpp":"91f0c1ffb3f8e7131981242735fffb64d56c1dbdb10561c12d7d58df9ce4c0b3",
  "wled.cpp":"5c3b0bfa58ac8f61f2fee0a9161209b28dd95a6c0536d98b06fdd6b888fb7201",
  "wled.h":"e75b06ba221bade02978200bda453e45054b34e45300aa5a83eead35ae336ca9",
};
const outputs={};
for (const [file,expected] of Object.entries(originals)) {
  const path=resolve(source,"wled00",file), bytes=await readFile(path);
  if(hash(bytes)!==expected) throw new Error(`Unexpected pinned ${file}`);
  let s=bytes.toString();
  if(file==="wled.h") s=once(s,"#define VERSION 2607201",`#define VERSION ${build}`);
  else {
    s=once(s,'#include "wled.h"','#include "wled.h"\n#include "loo_ddp.h"');
    if(file==="e131.cpp") {
      const start=s.indexOf("static void handleDDPPacket(e131_packet_t* p, size_t packetLen) {"), end=s.indexOf("//E1.31 and Art-Net protocol support",start);
      if(start<0 || end<0) throw new Error("DDP function boundaries missing");
      s=s.slice(0,start)+"static void handleDDPPacket(e131_packet_t* p, size_t packetLen) {\n  looDdpReceive(reinterpret_cast<const uint8_t*>(p), packetLen);\n}\n\n"+s.slice(end);
    }
    if(file==="udp.cpp") s=once(s,"void handleNotifications()\n{","void handleNotifications()\n{\n  looDdpService();");
    if(file==="wled.cpp") s=once(s,"      strip.service();","      if (realtimeMode != REALTIME_MODE_DDP || realtimeOverride) strip.service();");
    if(file==="json.cpp") s=once(s,"void serializeInfo(JsonObject root)\n{",`void serializeInfo(JsonObject root)
{
  const auto ds=looDdpStats();
  JsonObject ddp=root.createNestedObject("ddpFrames");
  ddp["packets"]=ds.packets; ddp["complete"]=ds.complete;
  ddp["rejected"]=ds.rejected; ddp["incomplete"]=ds.incomplete;
  ddp["replaced"]=ds.replaced; ddp["submitted"]=ds.submitted;
  ddp["sequenceGaps"]=ds.sequenceGaps;
  ddp["receiveGapsOver40ms"]=ds.receiveGapsOver40ms;
  ddp["submitGapsOver40ms"]=ds.submitGapsOver40ms;
  ddp["maxReceiveGapUs"]=ds.maxReceiveGapUs;
  ddp["maxSubmitGapUs"]=ds.maxSubmitGapUs;
  ddp["lastReceiveUs"]=ds.lastReceiveUs;
  ddp["lastSubmitUs"]=ds.lastSubmitUs;`);
  }
  outputs[file]=s;
}
// Validate every input before writing any patched source.
for(const [file,s] of Object.entries(outputs)) await writeFile(resolve(source,"wled00",file),s);
for(const file of ["DdpFrames.h","loo_ddp.h","loo_ddp.cpp"]) await copyFile(resolve(import.meta.dirname,file),resolve(source,"wled00",file));
console.log(`Patched complete-frame DDP build ${build}.`);
