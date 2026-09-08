#include "DdpFrames.h"
#include <cassert>
#include <mutex>
#include <thread>
#include <atomic>
#include <vector>
#include <algorithm>
static std::mutex mux;
static void lock(){mux.lock();} static void unlock(){mux.unlock();}
static std::vector<uint8_t> packet(size_t offset,size_t count,uint8_t seq,bool push,uint8_t value) {
  std::vector<uint8_t> p(10+count,value);
  p[0]=push?0x41:0x40; p[1]=seq; p[2]=0x0b; p[3]=1;
  p[4]=offset>>24; p[5]=offset>>16; p[6]=offset>>8; p[7]=offset;
  p[8]=count>>8; p[9]=count;
  return p;
}
static uint8_t send(LooDdpFrames& q,uint8_t seq,uint8_t value,uint32_t now,size_t size=LooDdpFrames::Capacity) {
  for(size_t i=0;i<size;i+=1440) {
    size_t n=std::min(size-i,size_t(1440)); auto p=packet(i,n,seq,i+n==size,value);
    q.receive(p.data(),p.size(),size,now); if(seq) seq=seq%15+1;
  }
  return seq;
}
static void check(LooDdpFrames::Frame f,uint8_t value) { assert(f.pixels); for(size_t i=0;i<f.size;++i) assert(f.pixels[i]==value); }
int main() {
  LooDdpFrames q(lock,unlock);
  auto first=packet(0,1440,14,false,11);q.receive(first.data(),first.size(),7872,1);assert(!q.take().pixels);
  auto tail=packet(1440,1440,15,false,11);q.receive(tail.data(),tail.size(),7872,2);assert(!q.take().pixels);
  uint8_t seq=send(q,14,22,25000); assert(seq==5); check(q.take(),22); q.release(true,26000);
  assert(q.stats().incomplete==1);
  seq=send(q,seq,33,50000);auto held=q.take();check(held,33);
  seq=send(q,seq,44,75000);seq=send(q,seq,55,100000);check(held,33);
  assert(q.stats().replaced==1);q.release(true,101000);check(q.take(),55);q.release(true,102000);
  auto broken=packet(0,1440,seq,false,66);q.receive(broken.data(),broken.size(),7872,120000);
  auto missing=packet(2880,1440,seq%15+1,false,66);q.receive(missing.data(),missing.size(),7872,120001);assert(!q.take().pixels);
  auto shortPacket=packet(0,3,1,true,77);q.receive(shortPacket.data(),shortPacket.size()-1,3,1);assert(!q.take().pixels);
  shortPacket[3]=2;q.receive(shortPacket.data(),shortPacket.size(),3,1);assert(!q.take().pixels);
  auto early=packet(0,3,1,true,77);q.receive(early.data(),early.size(),7872,1);assert(!q.take().pixels);
  auto noPush=packet(0,3,1,false,77);q.receive(noPush.data(),noPush.size(),3,1);assert(!q.take().pixels);
  auto tooLarge=packet(0,3,1,true,77);q.receive(tooLarge.data(),tooLarge.size(),7875,1);assert(!q.take().pixels);
  send(q,0,88,150000);check(q.take(),88);q.release(true,151000);
  assert(q.stats().rejected>=5);
  // Stress ownership while a producer repeatedly replaces unread frames.
  LooDdpFrames concurrent(lock,unlock);std::atomic<bool> done{false};
  std::thread producer([&]{uint8_t s=1;for(int i=0;i<2000;++i)s=send(concurrent,s,uint8_t(i),uint32_t(i)*25000);done=true;});
  do { auto f=concurrent.take();if(f.pixels){auto v=f.pixels[0];std::this_thread::yield();check(f,v);concurrent.release(true,1);} } while(!done);
  producer.join();auto last=concurrent.take();if(last.pixels){check(last,last.pixels[0]);concurrent.release(true,2);}
  assert(concurrent.stats().complete==2000);
}
