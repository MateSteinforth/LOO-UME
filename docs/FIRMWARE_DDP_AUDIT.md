# FIRM-031: independent DDP/audio firmware audit

Date: 2026-09-09. Controller remained on 2609085 throughout this audit. No OTA,
configuration write, LED stream injection, or physical wiring change was made.

## Conclusion

The leading testable explanation for the wrong-color flashes is an insufficient
LED reset/latch interval under repeated DDP refreshes. The selected WS2812x speed
class declares 300 microseconds, but the actual Core 3 RMT encoder emits only
50 microseconds. This is confirmed in both source and the compiled 2609085 ELF.

Independently, the DDP receiver does not preserve complete-frame ownership. The
normal animation timer can present partially received frames, and notifications
can collapse. These are reproducible code behaviors and plausible contributors
to tearing and uneven motion. Their physical contribution has not been measured.

Neither finding yet establishes the sole cause of every observed symptom.
In particular, the non-audio build also has the short-reset driver and previously
had clean DDP. Its actual inter-transmission idle time was not measured. Do not
attribute that comparison to audio CPU load alone.

## Preserved baseline

- Controller: `loo-ume.local`, observed IP `192.168.68.53`, MAC `2462abc9f3a8`.
- Build 2609085; DDP active; main-segment mode enabled; one frozen segment,
  logical indices 0–2623. Audio processing running. Configured animation rate
  42 FPS; API reported 47 FPS during DDP. This API counts show calls, not received
  unique frames or verified LED latches.
- GPIO16: start 0, length 704. GPIO17: start 704, length 640. GPIO21: start 1344,
  length 640. GPIO22: start 1984, length 640. Mapping unchanged.
- Artifact `/tmp/loo-ume-audio-rmt-iram/build/firmware-audioreactive/wled-audioreactive-rmt4-esp32.bin`.
- SHA-256 `2d2194e8617d077d4f85567484eda801b0abe9249fca52c7fa8c852f7e6cd1e2`.
- Source and ELF root: `/tmp/loo-ume-audio-rmt-iram/build/firmware-source`.
- Repaired TX2 solder fault is separate. The failed 2609091/2609092 shutdown
  experiments and GPIO16 length reduction are not accepted fixes.

## 1. Actual reset interval differs from the selected speed

Paths below are relative to the source root. `NPB` means
`.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575/src/internal/methods/ESP/ESP32`.

- `wled00/bus_wrapper.h:268` selects the Ws2812x RMT method for the RGB bus.
- `NPB/NeoEsp32RmtSpeed.h:63` defines that speed with 400/850 ns zero bits,
  800/450 ns one bits, and a 300 microsecond reset.
- `NPB/NeoEsp32RmtXMethod.h:267` instead calculates reset ticks from a hard-coded
  50 microseconds; lines 288–292 split this into two low intervals. It never
  consumes the speed class's reset duration.
- The 2609085 ELF's Ws2812x `Initialize()` is at `0x400e850c`. The instruction at
  `0x400e8590` loads literal `0x03e803e8` and writes it to the reset symbol at
  `0x400e8595`: two low intervals of 1000 ticks. At the configured 40 MHz,
  2000 ticks are exactly 50 microseconds. The ELF also shows the encoder object
  being zeroed; there is no uninitialized encoder-state finding.

The manufacturer's [WS2812B-V5/W datasheet, page 3](https://datasheet.lcsc.com/datasheet/pdf/3795cfb9d54f7ec8ecc0b043ede3c05a.pdf?productCode=C2846931)
specifies a reset low interval greater than 280 microseconds. The installed LED
revision is not established, so this is a compatibility risk and a specific
hypothesis to test, not proof that the sculpture uses that exact revision.

### Why this could produce the observed pattern

`BusManager::show()` starts buses sequentially (`wled00/bus_manager.cpp:1438`).
Each NeoPixelBus `Update()` waits for its own previous transmission, then starts
the next immediately (`NeoEsp32RmtXMethod.h:169`). There is no additional
speed-specific latch guard. GPIO16 is both the first and longest configured bus.

| Quantity | GPIO16 / 704 LEDs | Other buses / 640 LEDs |
| --- | ---: | ---: |
| RGB data time at 1.25 microseconds per bit | 21.120 ms | 19.200 ms |
| Data plus actual encoded reset | 21.170 ms | 19.250 ms |
| Low interval with ideal 23 ms start cadence | about 1.880 ms | about 3.800 ms |
| Extra idle afforded by waiting for the longest bus | none | about 1.920 ms |

When a show is requested before GPIO16 finishes, its Update waits and immediately
restarts. Its reset low can approach 50 microseconds plus software overhead.
Shorter buses have already finished and ordinarily receive extra idle time while
the caller waits for GPIO16. Actual start skew and software costs are unmeasured.

This accounts for the direction of several observations:

- Native animation uses a roughly 23 ms cadence and can leave ample reset time.
- DDP PUSH triggers can request output sooner than the native cadence and bring
  the longest bus close to continuous transmission.
- Reducing GPIO16 to 640 removes the other buses' approximately 1.92 ms timing
  advantage, so corruption can spread even though each bus got shorter.
- Removing audio work can remove incidental delay, shortening the reset interval
  rather than improving it. This is a timing inference, not a measured scheduler
  trace. The previous shutdown results therefore do not demand still deeper
  audio shutdown.

The earlier handoff's “data time + 300 microseconds” estimate was incorrect for
the actual encoder. Total physical low time can still exceed 50 microseconds
because the GPIO stays low until the next transmission.

## 2. DDP packets and displayed frames lack independent ownership

The exact active code path is:

1. `wled00/e131.cpp:88` writes each packet's pixels immediately.
2. `wled00/FX_fcn.cpp:1793` routes them to the main segment's live pixel buffer.
3. `wled00/FX.h:535` stores each pixel directly in that array.
4. `wled00/e131.cpp:92` treats PUSH as a boolean display notification. It does
   not validate receipt of all six packets or publish an immutable frame.
5. `wled00/udp.cpp:475` converts that boolean to `strip.trigger()` after its
   greater-than-15-ms gate. It does not attach a frame snapshot or frame number.
6. `wled00/wled.cpp:131` continues `strip.service()` during main-segment DDP.
7. `wled00/FX_fcn.cpp:1306` renders on its own timer or a trigger. Line 1331 sets
   `doShow` for an active segment even when frozen. Freeze stops the effect,
   not output refresh.
8. `wled00/FX_fcn.cpp:1491` reads the live segment array during blending. This
   array can already contain some pixels from the next incoming frame.

AsyncUDP receives on core 0, priority 3; the main loop runs on core 1. FFT runs
on core 0, priority 1. These are the pinned SDK configuration and source
settings, not a live task trace. No complete-frame lock or publication boundary
protects the segment array from concurrent reception and blending.

### Reproduced on the host

Run:

```sh
python3 firmware/diagnostics/reproduce-ddp-ownership.py \
  /tmp/loo-ume-audio-rmt-iram/build/firmware-source
```

The harness extracts unchanged `handleDDPPacket()`, `WS2812FX::service()`, and the
notification gate. Hardware, effect execution, time, and the final show snapshot
are stubs. It demonstrates legal interleavings, not their frequency on hardware.

All five checks passed:

- With a known complete red frame, a single non-PUSH blue packet is rendered by
  the autonomous timer as 480 blue pixels plus 2144 old red pixels.
- Reducing the native timer to 1 FPS suppresses that autonomous partial repaint;
  a DDP PUSH still renders at 34 ms because a trigger overrides the timer.
- A pending PUSH for a completed blue frame can instead show a partial next
  green frame.
- Two completed frames before consumption collapse to one boolean event.
- A frame with a missing middle packet is still published on PUSH, retaining
  480 stale pixels.

This does not prove arbitrary bit/color corruption. In the ordinary aligned
32-bit pixel path, mixed frames predominantly expose old/new pixel values.
Repeated identical input frames make that class of visual tearing invisible.

DDP packets are in logical mapping order: the first 480-pixel packet contains
112 GPIO16, 112 GPIO17, 96 GPIO21, and 160 GPIO22 pixels. Therefore “the first
packet affects the first GPIO” is not a valid explanation for this sculpture.

## 3. RMT findings that were checked, but are not established root causes

The independent RMT audit found the normal NeoPixelBus buffer swap correct:
Update waits for the prior transfer, transmits the editing buffer, and swaps it
into the sending role. Subsequent writes use the other buffer. Queue depth 4
does not imply four overlapping transfers because every Update first waits for
all outstanding work on that channel. No normal-path active-payload reuse was
demonstrated. Ignored transmit errors remain an observability gap.

The 128-symbol allocation gives 64-symbol ping-pong halves. At 1.25 microseconds
per symbol, each refill has about 80 microseconds before that half is needed.
Delayed refill can produce bad output; see the matching
[Espressif RMT documentation](https://docs.espressif.com/projects/esp-idf/en/v5.3.4/esp32/api-reference/peripherals/rmt.html#iram-safe).
But no deadline miss was measured. Native uses the same driver and is clean;
audio shutdown worsening also weakens a simple “audio interrupt starvation”
explanation. Do not repeat interrupt-priority changes without measurements.

## Next tests: preserve firmware and change one variable at a time

### A. Suppress autonomous refreshes, keep DDP at 30 FPS

Temporarily change only WLED `hw.led.fps` from 42 to 1, retaining main-segment
mode, audio configuration, all lengths, and mapping. This changes WLED's native
animation timer; it does not set the DDP stream to 1 FPS. The extracted service
test confirms PUSH-triggered rendering bypasses this timer.

Save the original setting first, allow the configuration-save transient to
settle, observe the same LOOUME effect at 30 FPS, then restore 42. Do not switch
to native animation or reconnect LOOUME while the temporary contract difference
is active. Native animation would be slow if left at 1 FPS.

Regular 30 FPS frames should leave millisecond-scale idle gaps and remove the
extra 23 ms refresh source. Network bursts can still collapse intervals, so the
test does not guarantee a minimum physical latch gap. Improvement supports a
refresh-timing mechanism but alone does not distinguish reset timing, refill
load, and partial-frame exposure.

### B. Repeat an identical static pattern over DDP

Use the same input bytes for every frame at 30 FPS, first at the original WLED
timer and then at the temporary timer setting. A fixed red/blue spatial pattern
is more informative than an all-black image. Maintain the same brightness.

- Wrong colors with identical packets cannot be explained by mixing successive
  image contents. Investigate reset intervals, RMT refill or output path.
- Fixed-pattern flashes that clear when autonomous refresh is suppressed make
  reset/output timing a stronger suspect.
- Static pattern clean, moving pattern torn: prioritize frame publication and
  presentation cadence. Static cleanliness alone does not rule out a
  content-dependent electrical or RMT issue.

### C. Direct measurement if available

A logic-analyzer capture of GPIO16 and a shorter output can measure low gaps
between complete transmissions and detect replayed/shortened bit sequences.
No firmware change is needed. Compare clean native and failing DDP captures.
If GPIO16's gaps remain comfortably above 300 microseconds during flashes, the
short-reset hypothesis is weakened; investigate refill deadlines and frame data.

Only after this evidence should a firmware comparison be proposed. The narrow
reset candidate would honor the selected speed's 300-microsecond reset while
leaving audio lifecycle and DDP receiver unchanged. A separate receiver change
would assemble complete frames and present each committed frame once, with
bounded ownership and measured timings. Do not combine both with another audio
shutdown rewrite and then infer which change mattered.

## Remaining uncertainty

There is no proven zero-drop throughput measurement, wire capture, or confirmed
installed LED revision. The exact reason non-audio 2609051 had no visible flashes
remains open. Physical tests above have been prepared but not executed. No fix
is claimed, and 2609085 remains the untouched fallback.
