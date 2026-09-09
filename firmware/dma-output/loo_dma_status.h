#pragma once
#include <atomic>
#include <stdint.h>
#include <stddef.h>

extern "C" size_t i2sDmaDataBytes(uint8_t bus_num);
extern "C" size_t i2sDmaDescriptorBytes(uint8_t bus_num);

extern std::atomic<uint32_t> loo_dma_requested;
extern std::atomic<uint32_t> loo_dma_active_lanes;
extern std::atomic<uint32_t> loo_dma_failure;
extern std::atomic<uint32_t> loo_dma_required;
extern std::atomic<uint32_t> loo_dma_free_before;
extern std::atomic<uint32_t> loo_dma_largest_before;
extern std::atomic<uint32_t> loo_dma_allocated;
extern std::atomic<uint32_t> loo_dma_descriptors;
