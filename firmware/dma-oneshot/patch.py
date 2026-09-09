#!/usr/bin/env python3
"""Make the selected I2S1 DMA descriptor graph stop on silent data."""
import hashlib
from pathlib import Path
import sys

DRIVER = ".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575/src/internal/methods/ESP/ESP32/Core_2_x/Esp32_i2s.c"
HASHES = {
    DRIVER: "b682e8271727fe9ba7499c39f1eaf8673883a94cf3320563f475ae228d576782",
    "wled00/wled.h": "f2bbd59b6009b1ac5f7b924b560a11cf0f0544269b636c38683156c9eb3d0911",
    "wled00/loo_dma_status.cpp": "4e1ae7a8aabc231a0ae34d9d6ec1d794e70346e33c63846923fabcc27cab74fe",
}


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f"Unexpected source anchor: {before}")
    return text.replace(before, after)


def apply(source):
    texts = {}
    for name, digest in HASHES.items():
        data = (source / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Unexpected source: {name}")
        texts[name] = data.decode()
    text = texts[DRIVER]
    text = once(text,
        "    if (dataSize < silenceSize * (I2S_DMA_SILENCE_BLOCK_COUNT_FRONT + I2S_DMA_SILENCE_BLOCK_COUNT_BACK)) return false;",
        "    if (dataSize <= silenceSize * (I2S_DMA_SILENCE_BLOCK_COUNT_FRONT + I2S_DMA_SILENCE_BLOCK_COUNT_BACK)) return false;")
    text = once(text,
        "    volatile uint32_t is_sending_data;",
        "    volatile uint32_t is_sending_data;\n    bool one_shot;\n    uint8_t active_bank;")
    text = once(text,
        "    lldesc_t* itemFirst = &I2S[bus_num].dma_items[0];",
        """    const size_t bankCount = I2S[bus_num].one_shot ? 2 : 1;
    const size_t bankSize = dmaCount / bankCount;
    for (size_t bank = 0; bank < bankCount; ++bank) {
    lldesc_t* itemFirst = &I2S[bus_num].dma_items[bank * bankSize];""")
    text = once(text,
        "    dmaItemInit(item, posSilence, silenceSize, itemNext);",
        "    dmaItemInit(item, posSilence, silenceSize, I2S[bus_num].one_shot ? item : itemNext);")
    text = once(text,
        "    dmaItemInit(itemNext, posSilence, silenceSize, item);",
        "    dmaItemInit(itemNext, posSilence, silenceSize, I2S[bus_num].one_shot ? itemNext + 1 : item);")
    text = once(text,
        "    dmaItemInit(item, posSilence, silenceSize, itemFirst);\n\n    return true;",
        """    // Each bank ends at the other bank's closed silent gate.
    lldesc_t* destination = I2S[bus_num].one_shot
        ? &I2S[bus_num].dma_items[(1 - bank) * bankSize] : itemFirst;
    dmaItemInit(item, posSilence, silenceSize, destination);
    }

    return true;""")
    text = once(text,
        "    I2S[bus_num].data_size = dataSize;",
        """    I2S[bus_num].one_shot = bus_num == 1 && parallel_mode && bytesPerSample == 1;
    I2S[bus_num].active_bank = 0;
    I2S[bus_num].data_size = dataSize;""")
    text = once(text,
        "            I2S_DMA_SILENCE_BLOCK_COUNT_BACK;\n\n    if (!i2sInitDmaItems",
        "            I2S_DMA_SILENCE_BLOCK_COUNT_BACK;\n    if (I2S[bus_num].one_shot) I2S[bus_num].dma_count *= 2;\n\n    if (!i2sInitDmaItems")
    text = once(text,
        "            itemLoopBreaker->qe.stqe_next = itemLoop;",
        "            if (!i2s->one_shot) itemLoopBreaker->qe.stqe_next = itemLoop;")
    anchor = "    // the second item (last of the two front silent items) is \n    // silent looping item\n    lldesc_t* itemLoopBreaker = &I2S[bus_num].dma_items[1];"
    text = once(text, anchor, """    if (I2S[bus_num].one_shot)
    {
        if (I2S[bus_num].dma_items == NULL || !i2sWriteDone(bus_num)) return false;
        const size_t bankSize = I2S[bus_num].dma_count / 2;
        const uint8_t bank = I2S[bus_num].active_bank;
        lldesc_t* gate = &I2S[bus_num].dma_items[bank * bankSize];
        lldesc_t* destination = &I2S[bus_num].dma_items[(1 - bank) * bankSize];
        // Close the destination before releasing the current silent gate.
        destination->qe.stqe_next = destination;
        I2S[bus_num].active_bank = 1 - bank;
        I2S[bus_num].is_sending_data = I2s_Is_Sending;
        __sync_synchronize();
        gate->qe.stqe_next = gate + 1;
        return true;
    }

""" + anchor)
    texts[DRIVER] = text
    texts["wled00/wled.h"] = once(texts["wled00/wled.h"], "#define VERSION 2609097", "#define VERSION 2609098")
    texts["wled00/loo_dma_status.cpp"] = once(texts["wled00/loo_dma_status.cpp"],
        '    status["audio_compiled"] = true;',
        '    status["audio_compiled"] = true;\n    status["one_shot_supported"] = true;')
    for name, value in texts.items():
        (source / name).write_text(value)


if __name__ == "__main__":
    apply(Path(sys.argv[1]))
