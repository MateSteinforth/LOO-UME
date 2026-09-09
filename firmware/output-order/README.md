# Output allocation test and DMA path review

The goal is reliable, smooth DDP and standalone audio-reactive effects. The
current2609094 diagnostic is non-audio; it is not a solution to that goal.
Audio2609085 remains preserved with its original configuration restore.

## Configuration-only allocation test

After a power cycle, the operator still reported GPIO22 flashing. Read-back
confirmed2609094, DDP active, probes off and GPIO16/17/21/22 assigned to RMT
channels0/2/4/6. No new firmware was flashed.

The test swapped the second and fourth bus entries:

| RMT channel | Original GPIO | Test GPIO |
| --- | ---: | ---: |
|0|16|16|
|2|17|22|
|4|21|21|
|6|22|17|

Each physical pin retained its full bus record: start address, length, color
order, reversal, current limit and driver. The guarded script proved equality
of all2624 pin/global-address/local-address tuples. Source confirms list-order
allocation (`cfg.cpp:225`, `FX_fcn.cpp:1228`) and explicit range-based pixel
routing (`bus_manager.cpp:1445`). Whole-strip length is the maximum bus end,
independent of order (`FX_fcn.cpp:1266`).

Apply09:01:11.732UTC; verified active DDP, expected channel allocation, unchanged
map and segment state. The serializer updated storedvid2609085→2609094 and
removed the uncompiled AudioReactive configuration. These were recorded as
known non-operational serialization differences, not silently ignored.

After more than90seconds settling, the observation was announced around
09:03:10UTC; clock start09:03:14, nominal deadline09:04:14, stop check09:04:20.
The stop was about6seconds late. No queries occurred during the visual window.
The first run received no physical report. The repeat below has operator
feedback; do not invent a result or count for this first window.

The exact original cfg.json was restored through WLED's supported `/upload`
handler at09:04:43.910UTC. That handler reboots the controller. Read-back
confirmed the complete original file contents including inactive audio options,
original order/RMT allocation, map, brightness and segment state; DDP resumed.
Private evidence is `build/device-test/` in this worktree. No secrets are tracked.

Interpretation: movement toward GPIO17 supports an allocation/scheduling cause.
Persistent GPIO22 makes a pin/chain-specific path more plausible but does not
prove an electrical fault. Order changes allocation addresses and launch order
as well as RMT channel assignment, so it does not isolate one RMT block alone.
LOOUME compares bus entries by index; restore the original order before an
ordinary reconnect. It was kept running during this temporary test.

## Operator-requested repeat

The operator requested the same allocation test again. Separate private
evidence is in `build/repeat-20260909-091533/`; the first run is preserved.
Select that run with `LOO_ORDER_TEST_RUN=repeat-20260909-091533` when invoking
`test.py`. Fresh prepare checks and fallback hash passed. Apply09:16:26.502UTC;
read-back verified the same swapped allocation, DDP active, probes off, and
unchanged physical mapping/segment state. The same known inactive-usermod
serialization differences apply; exact full config restoration is prepared.

The repeat used90seconds settling before a60-second observation. The initial
plan was to keep the test active until feedback and then restore; the operator's
subsequent departure instruction defers restoration. Keep LOOUME open during
the temporary allocation.

Repeat observation was announced around09:18:00UTC, clock start09:18:06 and
nominal deadline09:19:06. The finish message was sent after a09:19:01 clock
check and a short wait; the next clock check was09:19:21. Treat feedback as
approximate intervals rather than exact one-minute counts. Ending read-back
confirmed the intended swapped allocation and active DDP. The test allocation
remains active; restore has not yet run for this repeat. Keep this state
distinct from the restored first run.

Operator result: most flashes onGPIO22 every1–4seconds; fewer onGPIO16, about
every6seconds; other chains solid during this observation. Flashing did not
move toGPIO17 with the previousGPIO22 RMT slot. This weakens a slot-only cause;
it does not prove a downstream hardware fault or exclude firmware timing.

The operator is leaving, requested that this keep running, and asked for a
complete TASKS.md handoff to continue with a cheaper model. Leave the current
DDP/test configuration untouched while they are away. The top of TASKS.md is
the authoritative current state, restore procedure, evidence summary and
ordered FIRM-036–043 plan. Offline code/build/test preparation may continue;
physical observation, restore/reboot and installation resume with the operator.

## Independently reviewed route to reliable output

The pinned code already compiles an eight-lane parallel I2S1 DMA backend for
classic ESP32. Setting all four homogeneous WS281x outputs to `drv:1` selects
it. It pre-encodes the complete stream and starts only when all registered
lanes have contributed. The DMA descriptor chain transmits without64-symbol
refill callbacks. This directly removes the observed RMT refill failure mode
and starts the four outputs together. Runtime stability is not yet measured.

Evidence in pinned WLED/NeoPixelBus source:

- `wled00/wled_boards.h:42`: classic ESP32 parallel-I2S availability.
- `wled00/FX_fcn.cpp:1197`: more than one I2S bus selects parallel mode.
- `wled00/bus_wrapper.h:242`: classic ESP32 uses I2S1.
- `NeoPixelBus/src/internal/XMethods.h:129`: X8 maps to I2S1 on this target.
- `NeoPixelBus/src/internal/NeoMethods.h:64`: IDF5 classic ESP32 still includes
  the legacy `Core_2_x` I2S implementation. The current ELF contains it.
- `Core_2_x/NeoEsp32I2sXMethod.h:493`: wait, fill every lane, then start DMA.
- `Core_2_x/Esp32_i2s.c:151,684`: descriptor stream and EOF interrupt.
- AudioReactive `audio_reactive.cpp:202` and `audio_source.h:263` use I2S0.

The microphone and LED output therefore use separate peripherals on this
specific target. This corrects the earlier broad warning that any I2S LED
driver conflicts with audio. It does not establish simultaneous runtime
stability or apply to other ESP32 variants.

Three requirements precede a reliable rollout:

1. Guard DMA allocation and expose capacity. The longest lane needs a51408-byte
   contiguous DMA buffer, `(704*3+30)*8*3`, plus descriptors and7872front-buffer
   bytes across the four outputs. About117KB total free heap is not evidence
   of a large enough contiguous DMA block. The current code logs a failed
   allocation and then calls memset on null (`I2sXMethod.h:446`); initialization
   must fail safely and leave the controller recoverable. The normal info API
   reports total heap only; maxalloc exists only under WLED_DEBUG.
2. Update LOOUME's driver contract explicitly. The current deployment record
   includes `drv:0` (`src/wled/DeploymentContract.ts:134,381`), and reconnect
   compares it (`web/src/Esp32Setup.ts:1363`). A production DMA setup must
   record/accept drv1 while retaining exact pins, lengths and map identity.
   Do not disguise I2S as RMT or bypass the mapping checks.
3. Validate frame ownership/pacing separately. DMA removes refill deadlines,
   but cannot repair partially published incoming DDP frames. The original
   receiver and boolean PUSH notification still need complete-frame ownership
   and measured presentation pacing if moving effects remain uneven.

The minimum wire interval is21.42ms for704pixels and300us reset, before encoding
and scheduling. Start validation at30FPS, then40FPS if measured throughput
allows it. A reported47FPS is not proof of47complete physical frames. The
mono-buffered DMA implementation encodes after the previous transfer ends.

Acceptance sequence for a future guarded candidate: all four outputs present
and correct; repeated Solid without flashes; moving DDP at30then40FPS with
measured complete-frame delivery; native animation; native microphone-reactive
effects with LOOUME closed; repeated transitions between DDP and audio; power
cycle and sustained playback. Preserve2609085 throughout. No DMA switch, audio
restore or new flash occurred in this allocation test.
