#pragma once
#include "DdpFrames.h"
void looDdpReceive(const uint8_t* packet, size_t length);
void looDdpService();
LooDdpFrames::Stats looDdpStats();
