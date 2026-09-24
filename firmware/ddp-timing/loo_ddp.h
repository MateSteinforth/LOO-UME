#pragma once
#include "DdpFrames.h"
#include <atomic>

void looDdpReceive(const uint8_t* packet, size_t length, uint32_t sender);
void looDdpService();
void looDdpReset();
void looDdpExit();
bool looDdpShowAllowed();
bool looDdpSubmitting();
void looDdpDidShow();
void looDdpJson(JsonObject root);
// overlap: -1 keeps the mode, 0 waits for each transmission, 1 requests RMT overlap.
void looDdpControl(int overlap, bool resetTiming);
