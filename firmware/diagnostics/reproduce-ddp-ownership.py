#!/usr/bin/env python3
"""Host counterexamples using unchanged 2609085 receiver/service functions.

No network access or device writes. Stubs replace hardware, segment effects and
time. These show legal interleavings, not their frequency on the sculpture.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def function(source, signature):
    start = source.index(signature)
    brace = source.index("{", start)
    depth = 0
    for end in range(brace, len(source)):
        depth += (source[end] == "{") - (source[end] == "}")
        if depth == 0:
            return source[start:end + 1]
    raise ValueError(signature)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("--output", type=Path, default=Path("build/ddp-ownership"))
args = parser.parse_args()
root = args.source.resolve()
args.output.mkdir(parents=True, exist_ok=True)
files = {name: (root / "wled00" / name).read_text()
         for name in ("e131.cpp", "udp.cpp", "FX_fcn.cpp")}
receiver = function(files["e131.cpp"], "static void handleDDPPacket(e131_packet_t* p, size_t packetLen) {")
service = function(files["FX_fcn.cpp"], "void WS2812FX::service() {")
gate = function(files["udp.cpp"], "  if (e131NewData && millis() - strip.getLastShow() > 15)")
prelude = r'''
#include <algorithm>
#include <arpa/inet.h>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>
using byte = uint8_t;
unsigned long clockMs=0;
unsigned long millis(){return clockMs;}
void yield(){}
constexpr int FPS_UNLIMITED=0, MIN_FRAME_DELAY=2, TRANSITION_FADE=0, WLED_MAX_SEGNAME_LEN=32;
constexpr int DDP_HEADER_LEN=10, DDP_ID_CONTROL=246, DDP_ID_STATUS=251, DDP_ID_CONFIG=250;
constexpr int DDP_FLAGS_PUSH=1, DDP_FLAGS_QUERY=2, DDP_FLAGS_REPLY=4, DDP_FLAGS_STORAGE=8, DDP_FLAGS_TIME=16;
constexpr int REALTIME_MODE_DDP=8;
bool e131SkipOutOfSequence=false, e131NewData=false, realtimeOverride=false;
int realtimeMode=REALTIME_MODE_DDP, realtimeTimeoutMs=2500, DMXAddress=1;
byte e131LastSequenceNumber[1]={0};
void realtimeLock(int,int){}
#define DEBUG_PRINTLN(x) do{}while(0)
struct e131_packet_t {
  uint8_t flags=0,sequenceNum=0,dataType=0x0b,destination=1;
  uint32_t channelOffset=0;
  uint16_t dataLen=0;
  uint8_t data[1440]={};
};
struct Segment {
 bool freeze=true; unsigned mode=0,call=0; const char*name=nullptr;
 std::vector<uint32_t> pixels=std::vector<uint32_t>(2624);
 void handleTransition(){} void resetIfRequired(){} bool isActive(){return true;}
 uint16_t progress(){return 65535;} void beginDraw(uint16_t){} Segment*getOldSegment(){return nullptr;}
 static void modeBlend(bool){} static void handleRandomPalette(){}
};
struct WS2812FX {
 unsigned long _lastServiceShow=0,_lastShow=0,now=0,timebase=0;
 unsigned _frametime=23,_targetFps=42,_segment_index=0,blendingStyle=0;
 bool _triggered=false,_suspend=false,_isServicing=false;
 std::vector<Segment> _segments=std::vector<Segment>(1);
 Segment*_currentSegment=nullptr;
 void (*_mode[1])()={+[](){}};
 std::vector<std::vector<uint32_t>> displayed;
 unsigned long getLastShow(){return _lastShow;}
 void trigger(){_triggered=true;}
 void show(){displayed.push_back(_segments[0].pixels);_lastShow=millis();}
 void service();
};
WS2812FX strip;
bool useMainSegmentOnly=true;
void setRealtimePixel(unsigned i,byte r,byte g,byte b,byte w){
 if(i<2624) strip._segments[0].pixels[i]=(uint32_t(w)<<24)|(uint32_t(r)<<16)|(uint32_t(g)<<8)|b;
}
'''
tests = r'''
void packet(unsigned first,unsigned count,uint32_t color,bool push){
 e131_packet_t p; p.flags=0x40|(push?1:0);p.channelOffset=htonl(first*3);p.dataLen=htons(count*3);
 for(unsigned i=0;i<count;i++){p.data[i*3]=color>>16;p.data[i*3+1]=color>>8;p.data[i*3+2]=color;}
 handleDDPPacket(&p,10+count*3);
}
void frame(uint32_t color){for(unsigned i=0;i<2624;i+=480){unsigned n=std::min(480u,2624-i);packet(i,n,color,i+n==2624);}}
void reset(uint32_t color){strip=WS2812FX();clockMs=0;frame(color);e131NewData=false;}
constexpr uint32_t RED=0x200000,BLUE=0x000020,GREEN=0x002000;
int main(){
 reset(RED); // establish that PUSH has previously been seen
 packet(0,480,BLUE,false);assert(!e131NewData);
 clockMs=24;strip.service(); // autonomous timer, no PUSH or trigger
 assert(strip.displayed.size()==1);
 assert(std::count(strip.displayed.back().begin(),strip.displayed.back().end(),BLUE)==480);
 assert(std::count(strip.displayed.back().begin(),strip.displayed.back().end(),RED)==2144);
 std::cout<<"PASS: frozen segment displays 480 new +2144 old pixels before PUSH.\n";

 reset(RED);strip._frametime=1000;strip._targetFps=1;
 packet(0,480,BLUE,false);clockMs=24;strip.service();
 assert(strip.displayed.empty());
 frame(BLUE);clockMs=34;notify();strip.service();
 assert(strip.displayed.size()==1&&strip.displayed.back()[0]==BLUE);
 std::cout<<"PASS: native timer1FPS suppresses autonomous partial repaint; DDP PUSH still renders at34ms.\n";

 reset(RED);frame(BLUE);packet(0,480,GREEN,false);clockMs=17;notify();strip.service();
 assert(strip.displayed.size()==1&&strip.displayed.back()[0]==GREEN&&strip.displayed.back()[480]==BLUE);
 std::cout<<"PASS: pending PUSH for complete blue frame presents partial next green frame.\n";

 reset(RED);frame(BLUE);frame(GREEN);clockMs=17;notify();strip.service();
 assert(strip.displayed.size()==1&&strip.displayed.back()[0]==GREEN);
 std::cout<<"PASS: two completed frames collapse into one boolean notification.\n";

 reset(RED);
 for(unsigned i=0;i<2624;i+=480){if(i==480)continue;unsigned n=std::min(480u,2624-i);packet(i,n,BLUE,i+n==2624);}
 clockMs=17;notify();strip.service();
 assert(std::count(strip.displayed.back().begin(),strip.displayed.back().end(),RED)==480);
 std::cout<<"PASS: PUSH publishes a frame with a missing480-pixel packet and stale pixels.\n";
}
'''
cpp = args.output / "repro.cpp"
cpp.write_text(prelude + receiver + "\n" + service + "\nvoid notify(){\n" + gate + "\n}\n" + tests)
binary = args.output / "repro"
subprocess.run(["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(binary)], check=True)
result = subprocess.run([str(binary.resolve())], check=True, capture_output=True, text=True)
print(result.stdout, end="")
(args.output / "result.txt").write_text(result.stdout)
(args.output / "source-hashes.json").write_text(json.dumps({
    name: hashlib.sha256(text.encode()).hexdigest() for name, text in files.items()
}, indent=2) + "\n")
