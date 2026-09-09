# Complete-frame DDP and guarded DMA candidate

FIRM-040 prepares audio-capable firmware 2609096 from guarded firmware 2609095.
The candidate is not installed. Physical flicker, motion, audio, and memory checks remain open.
Keep the live controller unchanged while the operator is away.
Quiet periods of 7–10 seconds do not establish stable output.

## Frame ownership

The DDP receiver assembles RGB data in three fixed buffers.
Each buffer contains at most 7,872 bytes, or 2,624 RGB pixels.
The receiver can write one buffer while one complete frame waits and another frame supplies output.
New complete frames replace an older waiting frame under overload.
Packets never write directly into a segment or an active DMA buffer.

The receiver accepts display destination 1, RGB24 type `0x0b`, and version-one PUSH or non-PUSH data packets.
Each packet must contain exactly the declared payload, with aligned RGB offsets and at most 1,440 payload bytes.
Offsets must cover the complete configured strip in order. PUSH must mark the final packet.
The nonzero sequence advances from 1 through 15 and then returns to 1.
Sequence zero means unused; every packet in that candidate must then use zero.
Offset zero starts a new candidate and discards an incomplete candidate.
The sender address remains fixed within each candidate.

Lost, reordered, duplicate, malformed, and incomplete candidates cannot publish a partial pixel range.
The receiver discards a candidate after a 100 ms fragment gap.
A waiting complete frame also expires after 100 ms.
The queue protects packet copies and state changes with one short critical section.
The critical section copies at most 1,440 bytes. Painting, encoding, and output occur outside that section.
DDP has limited sequence information. Sequence zero cannot establish sender-frame identity after arbitrary packet delay or loss.
The LOO/UME output path sends nonzero packet sequences.

## Output boundary and native effects

A complete waiting frame takes realtime ownership before the previous output finishes.
The main loop waits for `BusManager::canAllShow()` without a blocking delay.
For parallel DMA, this check observes the final data-descriptor EOF flag.
The driver then sends silent control descriptors before the next data frame.
Those descriptors use the encoded reset tail; EOF does not prove that the physical output has finished.
The service then paints the complete frame through WLED's realtime pixel and mapping path.
Before painting, WLED checks the pixel buffer and its suspension state.
Painting uses WLED's service ownership flag so configuration changes can wait for it.
The existing driver starts all four encoded DMA lanes together.
There is no additional 15 ms presentation gate.

While DDP owns output, autonomous native refresh cannot present an intermediate segment state.
The selected main segment remains frozen. Its pending transition ends before the DDP frame is blended.
This prevents an old native transition from changing the complete DDP frame.
The microphone and audio effect source files remain unchanged.
Realtime override permits native service and discards waiting DDP data.
DDP exit discards queued data, then uses WLED's normal brightness, unfreeze, and effect-trigger recovery.
Bus reinitialization disables reception until the main loop installs the new frame size.

The default remains RMT. The complete-frame receiver applies to both RMT and guarded parallel DMA.
DMA still requires four RGB outputs, each with 1–704 pixels and no skipped pixels.
This candidate does not change GPIOs, output lengths, LED maps, microphone pins, or saved presets.
Unsupported DDP formats do not fall back to partial-frame output.

## Telemetry and memory

`/json/info.loo_ddp` reports packet, complete-frame, rejection, discard, replacement, presentation, and completion counters.
`presented` increments only after the driver show call returns.
`tx_completed` increments when a later service call observes the buses ready after a DDP submission.
For DMA, this counter observes data EOF. It does not measure the final silent interval or an electrical LED latch.
`tx_aborted_or_unobserved` records a submission whose completion was not observed before exit, reset, or another show.
`failed_show` reports a show call that did not reach the driver hook.
`paint_blocked` reports unavailable pixel storage or suspended rendering before painting starts.
Gap and paint-time maxima identify receive gaps and software delays separately.
Read counters before and after a physical test. Do not poll continuously during visual observation.

| Allocation | Bytes |
| --- | ---: |
| Three RGB frame buffers | 23,616 |
| Encoded DMA buffer for 704 pixels | 51,408 |
| Four RGB front buffers | 7,872 |
| Known pixel buffer total | 82,896 |

Queue metadata, DMA descriptors, WLED pixels, audio, network buffers, and task stacks require additional memory.
The queue uses fixed storage. It does not allocate memory during reception.
The inherited DMA allocation guards remain active.
The receipt records the queue object size and ELF sections.
Runtime free memory and contiguous DMA capacity still require device checks with audio running.

## Isolated build and checks

Copy the verified FIRM-036 source, toolchain, and Python packages into this task's `build/` directory.
Use independent copies. Keep the FIRM-036 source and all recovery images unchanged.
Apply the guarded source patch:

```sh
python3 firmware/ddp-dma/patch.py build/firmware-source
```

Generate the compiler command database:

```sh
env PATH="$PWD/build/firmware-python/bin:$PATH" \
  PLATFORMIO_CORE_DIR="$PWD/build/firmware-core" \
  PLATFORMIO_BUILD_CACHE_DIR="$PWD/build/ddp-dma-cache" \
  PYTHONPATH="$PWD/build/firmware-python" \
  python3 -m platformio run --project-dir build/firmware-source \
  --environment orbital_esp32dev --target compiledb
```

Repeat that command without `--target compiledb` to build the firmware.
Verify the result against the preserved guarded source:

```sh
python3 firmware/ddp-dma/verify.py \
  /tmp/loo-ume-ddp-output-diagnostics/build/firmware-source
```

Run the queue checks:

```sh
c++ -std=c++17 -O1 -g -Wall -Wextra -Werror \
  -fsanitize=address,undefined -pthread \
  firmware/ddp-dma/test-queue.cpp -o /tmp/loo-ddp-queue-asan
env ASAN_OPTIONS=detect_leaks=0 /tmp/loo-ddp-queue-asan
```

LeakSanitizer cannot run under this host's process tracing. The queue does not use dynamic allocation.
Host timing tests use a simulated clock and output duration. They do not establish ESP32 frame rate.
Run the extracted receiver and lifecycle checks:

```sh
python3 firmware/ddp-dma/test-service.py build/firmware-source
```

These checks execute the current receiver, queue, service, realtime entry/exit, notification prefix, and presentation guards.
The test substitutes pixel storage, LED mapping, and DMA timing.
Follow FIRM-038 through FIRM-043 for attended physical checks and recovery.
