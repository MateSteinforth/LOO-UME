#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <vector>
#include <iostream>

constexpr int MALLOC_CAP_DMA=1, SIG_GPIO_OUT_IDX=0, INPUT=0;
constexpr size_t I2S_DMA_MAX_DATA_LEN=4092;
unsigned starts=0, waits=0;
bool busy=false, failFront=false, failDma=false, failInit=false;
size_t largestDmaBlock=100000;
std::map<void*,size_t> allocations;
void (*onYield)()=nullptr;
void* allocate(size_t size,bool dma) {
  if ((dma && (failDma || size>largestDmaBlock)) || (!dma && failFront)) {
    failDma=failFront=false;
    return nullptr;
  }
  void* pointer=std::malloc(size);
  assert(pointer);
  allocations[pointer]=size;
  return pointer;
}
void release(void* pointer) {
  if (!pointer) return;
  assert(allocations.erase(pointer)==1);
  std::free(pointer);
}
extern "C" void* heap_caps_malloc(size_t size,int) { return allocate(size,true); }
extern "C" void heap_caps_free(void* pointer) { release(pointer); }
void* test_malloc(size_t size) { return allocate(size,false); }
void test_free(void* pointer) { release(pointer); }
void log_e(const char*,...) {}
void yield() { ++waits; assert(onYield); onYield(); }
void gpio_matrix_out(int,int,bool,bool) {}
void pinMode(int,int) {}
extern "C" bool i2sInit(uint8_t bus,bool,...) { assert(bus==1); bool result=!failInit; failInit=false; return result; }
extern "C" void i2sDeinit(uint8_t bus) { assert(bus==1 && !busy); }
extern "C" void i2sSetPins(uint8_t bus,int,int,int,bool) { assert(bus==1); }
extern "C" bool i2sWriteDone(uint8_t bus) { assert(bus==1); return !busy; }
extern "C" void i2sWrite(uint8_t bus) { assert(bus==1 && !busy); busy=true; ++starts; }
struct BusOne { static constexpr uint8_t I2sBusNumber=1; };
#define NeoNoSettings int
#define I2S_CHAN_RIGHT_TO_LEFT 0
#define I2S_FIFO_16BIT_SINGLE 0
#define malloc test_malloc
#define free test_free
#define private public
// ACTUAL_CLASSES
#undef private
#undef free
#undef malloc

using Map=NeoEspI2sMuxMap<uint8_t,NeoEspI2sMuxBusSize8Bit3Step>;
using Context=NeoEspI2sMonoBuffContext<Map>;
using Mux=NeoEsp32I2sMuxBus<Context,BusOne>;
struct Speed {
  static constexpr uint16_t BitSendTimeNs=1250;
  static constexpr size_t ResetTimeUs=300;
  static constexpr size_t ByteSendTimeUs(uint16_t) { return 10; }
};
struct Normal { static constexpr bool Inverted=false; };
using Method=NeoEsp32I2sXMethodBase<Speed,Mux,Normal>;
void assertEmpty() {
  assert(allocations.empty());
  assert(Mux::s_context.MuxMap.BusCount==0);
  assert(Mux::s_context.MuxMap.MaxBusDataSize==0);
  assert(Mux::s_context.I2sBuffer==nullptr);
}
void fail(unsigned mode,unsigned lane) {
  Method methods[4]={Method(16,704,3,0),Method(17,640,3,0),Method(21,640,3,0),Method(22,640,3,0)};
  for (unsigned index=0; index<4; ++index) {
    if (index==lane) {
      if (mode==0) failFront=true;
      if (mode==1) failDma=true;
      if (mode==2) failInit=true;
      if (mode==3) largestDmaBlock=51407;
      assert(!methods[index].Initialize());
      assert(methods[index].IsReadyToUpdate());
      methods[index].Update(true);
      largestDmaBlock=100000;
    } else assert(methods[index].Initialize());
  }
}
std::vector<uint8_t> prior;
void completeTransfer() {
  assert(busy);
  assert(std::memcmp(prior.data(),Mux::s_context.I2sBuffer,prior.size())==0);
  busy=false;
}
int main() {
  for (unsigned iteration=0; iteration<20; ++iteration) {
    for (unsigned lane=0; lane<4; ++lane) { fail(0,lane); assertEmpty(); }
    for (unsigned mode=1; mode<4; ++mode) { fail(mode,0); assertEmpty(); }
  }
  {
    Method methods[4]={Method(16,704,3,0),Method(17,640,3,0),Method(21,640,3,0),Method(22,640,3,0)};
    for (auto& method:methods) assert(method.Initialize());
    assert(Mux::s_context.I2sBufferSize==51408);
    assert(allocations.size()==5);
    const uint8_t values[4]={0xff,0x00,0xaa,0x55};
    for (unsigned lane=0; lane<4; ++lane) {
      std::memset(methods[lane].getData(),values[lane],methods[lane].getDataSize());
      methods[lane].Update(true);
      assert(starts==(lane==3 ? 1U : 0U));
    }
    const auto* data=Mux::s_context.I2sBuffer;
    auto sample=[&](size_t index) { return data[(index/4)*4+((index%4)^2)]; };
    for (size_t bit=0; bit<704*24; ++bit) {
      uint8_t lanes=bit<640*24 ? 15 : 1;
      uint8_t high=0;
      for (unsigned lane=0; lane<4; ++lane) {
        if ((lanes&(1<<lane)) && (values[lane]&(0x80>>(bit%8)))) high|=1<<lane;
      }
      assert(sample(bit*3)==lanes);
      assert(sample(bit*3+1)==high);
      assert(sample(bit*3+2)==0);
    }
    for (size_t index=704*24*3; index<51408; ++index) assert(sample(index)==0);
    prior.assign(data,data+51408);
    onYield=completeTransfer;
    std::memset(methods[0].getData(),0,methods[0].getDataSize());
    methods[0].Update(true);
    assert(waits==1 && starts==1 && !busy);
    for (unsigned lane=1; lane<4; ++lane) methods[lane].Update(true);
    assert(starts==2 && busy);
    busy=false;
  }
  assertEmpty();
  std::cout << "PASS: mono-buffer three-step encoding, 140 failure/retry cases, 51408-byte bounds, reset, and busy ownership\n";
}
