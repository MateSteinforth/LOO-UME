#include "wled.h"
#include "loo_dma_status.h"

std::atomic<uint32_t> loo_dma_requested{0};
std::atomic<uint32_t> loo_dma_active_lanes{0};
std::atomic<uint32_t> loo_dma_failure{0};
std::atomic<uint32_t> loo_dma_required{0};
std::atomic<uint32_t> loo_dma_free_before{0};
std::atomic<uint32_t> loo_dma_largest_before{0};
std::atomic<uint32_t> loo_dma_allocated{0};
std::atomic<uint32_t> loo_dma_descriptors{0};

class LooDmaStatus : public Usermod {
public:
  void setup() override {}
  void loop() override {}
  void addToJsonInfo(JsonObject& root) override {
    JsonObject status = root.createNestedObject("loo_dma");
    status["requested"] = loo_dma_requested.load() != 0;
    status["active_lanes"] = loo_dma_active_lanes.load();
    status["failure"] = loo_dma_failure.load();
    status["required_buffer_bytes"] = loo_dma_required.load();
    status["allocated_buffer_bytes"] = loo_dma_allocated.load();
    status["descriptor_bytes"] = loo_dma_descriptors.load();
    status["free_before"] = loo_dma_free_before.load();
    status["largest_before"] = loo_dma_largest_before.load();
    status["free_now"] = heap_caps_get_free_size(MALLOC_CAP_DMA);
    status["largest_now"] = heap_caps_get_largest_free_block(MALLOC_CAP_DMA);
    status["audio_compiled"] = true;
    status["led_peripheral"] = "I2S1 when drv1 is selected";
    status["microphone_peripheral"] = "I2S0";
  }
};

static LooDmaStatus looDmaStatus;
REGISTER_USERMOD(looDmaStatus);
