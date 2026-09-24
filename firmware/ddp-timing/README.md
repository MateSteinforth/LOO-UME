# DDP presentation timing and RMT overlap (FIRM-044)

Candidate 2609103 is built from the exact 2609099 source. It is not installed.
The default behavior at boot is the 2609099 behavior.

## Why this candidate exists

Firmware 2609099 already has a hidden DDP frame buffer (FIRM-040).
The receiver assembles each frame in one of three fixed buffers.
A frame goes to the LEDs only after its final PUSH packet.
A newer complete frame replaces an older frame that is still waiting.
The receiver never shows a partial frame and never queues old frames.
Do not add a second DDP double buffer.

On RMT with audio, 2609099 received 29.21 complete frames/s and showed 25.63 frames/s.
About 12% of the frames were replaced before they were shown.
Visible motion then skips frames.

`looDdpService()` paints a frame only when `BusManager::canAllShow()` is true.
Each shown frame then needs this time in sequence:

- 21.17 ms wire time: 704 pixels on GPIO16 at 30 us per pixel, plus the 50 us reset;
- paint and show time: usually below 9 ms, with one recorded 29.6 ms maximum;
- the delay until the main loop calls the service again.

This total is near the 33.3 ms period of a 30 frames/s stream.
When two frames arrive close together, the first frame waits and the second frame replaces it.

The RMT driver has two buffers. `NeoEsp32RmtXMethod::Update()` waits for the previous transmission.
It then sends the editing buffer and swaps the buffers. WLED writes only the editing buffer.
Painting during a transmission therefore does not change the frame on the wire.
The guarded DMA driver has one buffer, so the DMA path must continue to wait.

## Changes

- `/json/info` gets `loo_ddp.timing`, a set of histograms and counters. They are always on.
  They add about 30 short critical sections per second and no per-packet logging.
- `/json/state` accepts `{"loo_ddp":{"overlap":true}}` or `false`. Overlap is off at every boot.
  Presets cannot change it. It is active only when the DMA driver is not requested.
- With overlap on, the service paints the next complete frame while the previous frame transmits.
  `strip.show()` then waits in the RMT driver until that transmission ends and starts the new frame.
- `{"loo_ddp":{"reset":true}}` clears the timing block. It does not clear the older `loo_ddp` counters.

These parts do not change: packet validation, the three buffers, latest-frame replacement,
the WLED realtime pixel and ledmap path, realtime lock, timeout and exit, the main segment freeze,
native refresh suppression during DDP, AudioReactive, GPIOs, output lengths, DMA guards,
and the IRAM placement of the RMT callback.

## Timing fields

Each histogram has `n`, `avg_us`, `max_us`, and 18 `bins`.
`edges_us` gives the upper bin edges. Bin `i` holds values above `edges_us[i-1]` and at most `edges_us[i]`.
The last bin has no upper limit.

| Histogram   | Measurement                                                   | Cause that it shows              |
| ----------- | ------------------------------------------------------------- | -------------------------------- |
| `arrival`   | Interval between complete frames at the receiver              | UDP/DDP receive jitter           |
| `assembly`  | First packet to PUSH packet of one frame                      | Receive jitter inside a frame    |
| `wait_idle` | Completion to paint start, frame completed while idle         | Main-loop scheduling             |
| `wait_busy` | Completion to paint start, frame completed during paint/send  | Output pacing                    |
| `paint`     | `setRealtimePixel()` copy of one frame                        | Copy time                        |
| `show`      | `strip.show()`; with overlap, also the RMT driver wait        | Blend, map, ABL, driver pacing   |
| `latency`   | Completion to transmission start                              | End-to-end delay                 |
| `wire`      | Transmission start to the service call that sees completion   | Wire time plus late observation  |
| `present`   | Interval between transmission starts                          | The cadence that people see      |
| `loop`      | Main-loop time outside the DDP service                        | Main-loop scheduling             |

The counters `complete` and `presented` count frames since the last timing reset.
`overlapped` counts frames painted while the previous frame was still transmitting.
`since_ms` and `now_ms` give the window. `wire_estimate_us` is 30 us per pixel of the longest output plus 300 us.

Each replaced frame gets one cause:

- `replaced_wire`: the serialized service waited for the previous transmission;
- `replaced_paint`: the main loop was painting or inside `strip.show()`;
- `replaced_loop`: the service could take the frame, but the main loop did not call it in time.
  With overlap on, a frame replaced during a transmission counts here.

`python3 firmware/ddp-timing/report.py <info.json>...` summarizes saved `/json/info` files.
It gives rates, percentiles, and the main replacement cause. It does not contact the device.

## Host evidence

`test-service.py` compiles the actual patched receiver, service, realtime lifecycle,
notification prefix, and show prefix and suffix. The host boundary models the RMT driver exactly:
wait, send the editing buffer, swap. All FIRM-040 scenarios pass unchanged with overlap off.

- Three frames 5 ms apart every 100 ms (30 frames/s on average), 8 ms show, 21.42 ms wire:
  serialized output shows 20 of 30 frames; overlap shows 30 of 30.
- Every transmission is one complete frame, in order, and no transmission starts before the previous one ends.
- With overlap and 66.7 frames/s input, transmissions run back to back, the newest frame wins,
  and latency stays below two wire times plus show time.
- DMA stays serialized when overlap is requested.

These results come from a simulation. They do not measure the ESP32.

## Attended comparison

Do these steps only with the operator present and with explicit approval for the OTA installation.
Change one variable at a time. Do not poll the device during an observation window.

1. Save private copies of `cfg.json`, the ledmap, presets, `/json/state`, and `/json/info`.
   Use the procedure of the 2609099 installation. Verify MAC `2462abc9f3a8` before any write.
2. Install `wled-audio-ddp-timing-2609103.bin` with the same OTA procedure as 2609099.
   Read back `/json/info`: `vid` 2609103, `overlap_active` false, DMA off, GPIOs 16, 17, 21, and 22.
3. Start the same moving LOO/UME stream at 30 frames/s. Use slow moving content that shows skips.
   Wait 90 s.
4. Window A, overlap off. Clear the timing block:

   ```bash
   curl -fsS -H 'Content-Type: application/json' \
     -d '{"loo_ddp":{"overlap":false,"reset":true}}' http://<device-ip>/json/state
   ```

   Observe for 60 s. Then save `curl -fsS http://<device-ip>/json/info > A.json`.
5. Window B, overlap on. Send `{"loo_ddp":{"overlap":true}}` in the same way and wait 90 s.
   Then send `{"loo_ddp":{"reset":true}}`, observe for 60 s, and save `B.json`.
6. Run `python3 firmware/ddp-timing/report.py A.json B.json`.
   Record the visual result and any flashes for each output. Keep them separate from the telemetry.
7. Stop the stream. Confirm that DDP releases after the timeout and that the saved audio effect responds
   to the INMP441 microphone. Check the ledmap orientation with the review gradient.
8. Power cycle the controller. Confirm `overlap_requested` is false after the restart.

To return to the accepted baseline, install the preserved 2609099 image
(`007c3e6c584a86d7b9bfc1522a9413d0a9867677b27f2ba07d81f4680d42cac4`) with the same OTA procedure.

## Decisions after the comparison

| Result                                                     | Next step                                            |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| B shows at least 97% of complete frames, no new flashes    | Make overlap the default in a later build             |
| `replaced_wire` falls to zero, `replaced_loop` remains     | Main loop is late: examine `loop` p99 and its cause   |
| `arrival` shows bunching or gaps above 50 ms               | Sender or Wi-Fi jitter: examine the sender first      |
| `paint` or `show` is long                                  | Reduce copy work in the realtime paint path           |
| Flashes increase with overlap                              | Keep overlap off and record the flashes per output    |

A frame pacer or a separate DDP task is a later option. Use it only when this data shows that it is necessary.

## Build and checks

Use an isolated worktree. Copy the verified 2609099 source, toolchain, and Python packages:

```bash
cp -a /tmp/loo-ume-ddp-audio-unified/build/firmware-{core,python,source} <worktree>/build/
python3 <worktree>/firmware/ddp-timing/patch.py <worktree>/build/firmware-source
env PATH="<worktree>/build/firmware-python/bin:$PATH" \
  PLATFORMIO_CORE_DIR="<worktree>/build/firmware-core" \
  PLATFORMIO_BUILD_CACHE_DIR="<worktree>/build/timing-cache" \
  PYTHONPATH="<worktree>/build/firmware-python" \
  python3 -m platformio run --project-dir <worktree>/build/firmware-source \
  --environment orbital_esp32dev --target compiledb
```

Repeat the last command without `--target compiledb` to build. Then run:

```bash
python3 <worktree>/firmware/ddp-timing/test-service.py <worktree>/build/firmware-source
python3 <worktree>/firmware/ddp-timing/report.py --self-test
python3 <worktree>/firmware/ddp-timing/verify.py
```

Also compile `firmware/ddp-dma/test-queue.cpp` and `firmware/ddp-expiry/test-expiry.cpp` against the new
`DdpFrames.h`. Copy `test-queue.cpp` next to that header first, because a quoted include searches its own directory.
`verify.py` reconstructs the source from the preserved 2609099 tree and checks the flags, image, IRAM placement,
and static memory. LTO inlines `looDdpService()` and `looDdpControl()`. The check therefore looks for their
state objects, the larger `deserializeState()`, and the new JSON keys, not for function symbols.

## Limits

- With overlap on, the main loop waits inside the RMT driver for up to one wire time per frame
  when frames arrive faster than the wire. Stock WLED behaves the same way.
- If an RMT transmission stops, overlap can block the main loop until the 10 s driver timeout.
  The serialized path never calls `strip.show()` while the output is busy.
- With overlap on, `max_paint_us` includes the driver wait.
- `wire` includes the delay until the main loop sees the completion.
- `wire_estimate_us` assumes WS2812 timing at 800 kHz.
- The timing block adds about 4 KB to the 32 KB JSON document and 1,864 bytes of static RAM.
