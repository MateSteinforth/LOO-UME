# Project task board

Last reconciled: 2026-09-05
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: deliver one complete package with a unified external-frame
simulator and TouchDesigner DDP input.

## Active firmware handoff — read this first (2026-09-09)

**Operator goal:** reliable, smooth LOOUME→DDP mirroring AND standalone
microphone-reactive WLED effects on the same controller. Minimize flashes,
aim for zero observed corruption. A lower flash rate alone is not a completed
fix; report measured rates and let the operator accept any residual limit.
Clean30FPS is the first motion target;40FPS is a subsequent measured target.

**Latest instruction:** operator is leaving and wants to keep this running,
then continue with a cheaper model. Leave the current live device/session
unchanged while they are away. Offline inspection, implementation, builds and
host tests can continue. Do not start physical tests, restore/reboot, change
live configuration or flash while the operator is absent. Prepare concrete
candidates for the next attended test. Do not infer physical results.

**Current state — differs from the normal project order:**

- Firmware2609094, non-audio diagnostic; timing/CRC collection OFF. DDP active
  at last read-back. Mic functionality is currently unavailable.
- ESP32 WROOM, `loo-ume.local`, lastIP192.168.68.53; verify MAC2462abc9f3a8
  before writes. Four level-shifted WS2812 RGB outputs, GRB order0,2624LEDs.
- Allocation-test bus list is **[16,22,21,17]**, RMT channels[0,2,4,6].
  Per-pin addressing is unchanged:16 start0 len704;17 start704 len640;
  21 start1344 len640;22 start1984 len640. Keep the map and brightness128.
- Latest observed repeat: **GPIO22 flashes every1–4s; GPIO16 about every6s;
  GPIO17/21 solid during the observation.** Flashing did not follow the old
  GPIO22 RMT slot toGPIO17. This weakens a slot-only explanation, but does
  not prove a hardware fault or exclude firmware timing.
- This repeat has NOT been restored. User departure supersedes the earlier
  plan to restore immediately after feedback. Keep LOOUME open in this state;
  reconnect can reject the temporary list order. Do not apply ESP32 Setup as
  a workaround or overwrite the authored route.

**Working location:** `/tmp/loo-ume-output-order-test`, branch
`codex/output-order-test`. Prior repeat commit24b7a76; handoff updates follow it.
Do not use main's older task board as the latest firmware state. Continue
repository implementation in a new task branch/worktree, following AGENTS.md.
No implementation task below is already complete merely because it is listed.

**Exact repeat backup/restore (use when operator returns):**

```bash
# workdir: /tmp/loo-ume-output-order-test
env LOO_ORDER_TEST_RUN=repeat-20260909-091533 python3 firmware/output-order/test.py restore
# Wait for the supported cfg upload/reboot to finish, then:
env LOO_ORDER_TEST_RUN=repeat-20260909-091533 python3 firmware/output-order/test.py verify restored
```

The script restores the complete private cfg.json, including inactive audio
options that a non-audio `/json/cfg` save omits. It guards against unrelated
configuration changes. On guard failure, inspect and preserve those changes;
do not weaken assertions or blindly upload an old config. Evidence/backup:
`build/repeat-20260909-091533/`. Earlier run `build/device-test/` is separate.
Normal bus order is[16,17,21,22]. Config restore does not install audio firmware.

**Preserve these exact artifacts; never overwrite them:**

- Audio2609085: `/tmp/loo-ume-audio-rmt-iram/build/firmware-audioreactive/wled-audioreactive-rmt4-esp32.bin`;
  SHA256 `2d2194e8617d077d4f85567484eda801b0abe9249fca52c7fa8c852f7e6cd1e2`.
  Native animation/Gravimeter132 and mic response were physically clean after
  the repairedGPIO17 solder joint; DDP remained imperfect.
- Non-audio2609051: `/home/mate/Documents/led-rhombicosidodecahedron/build/firmware-rmt4-2609051/wled-orbital-esp32dev.bin`;
  SHA256 `f84dbc5015dab45ada68e53a5968732458f19ae2b993238cfc183d2ca87aae55`.
- Reset300us2609093: `/tmp/loo-ume-rmt-reset-gap-test/build/firmware-reset-gap/wled-nonaudio-reset300-2609093.bin`;
  SHA256 `752e485c34433d8dc3a1132d605e34618c919654f1ebf46b8b78fb63a3054f71`.
- Original mic restore: `/tmp/loo-ume-audio-cold-off-20260909-073913/restore.json`.
  Returning to audio needs enabled=true, GenericI2S type1, SD32/WS26/SCK27,
  MCLK-1, then reboot. Current stored disabled/type255 options would prevent
  audio even after installing an audio image. Keep private configs out of Git.

**Reuse established evidence to control cost:**

- Read `firmware/output-order/README.md` for exact DMA source references and
  `firmware/rmt-probe/RESULTS.md` for measurements. Read the long
  `/home/mate/WLED-AUDIO-DDP-HANDOFF.md` only for a specific historical question.
- Audio shutdown/uninstall builds2609082/091/092 made flicker worse. Raising
  RMT priority, shorteningGPIO16, suppressing autonomous refresh and extending
  reset to300us did not eliminate it. Do not repeat these without new evidence.
- Original non-audio also flashes under repeated Solid; audio is not necessary
  for all corruption. Stable task buffers:2646completed CRC checks/output,
  zero changes/mutations in a separate sample. Sparse verified RMT refill
  delays cannot account for frequentGPIO22 flashes. Probes can change timing.
- Current RMT source/ELF: `/tmp/loo-ume-rmt-output-probe/build/firmware-source`.
  Audio baseline source: `/tmp/loo-ume-audio-rmt-iram/build/firmware-source`.
  WLEDd9b9a846561227351ad929e3109781daadb7bed2;
  NPB76afe832f74b0738a3fa1bba0caf389ade9e7693;
  Arduino3.3.7 / exact Tasmota IDFb3b492ffc273f17f4ed3c83c19ed110cd6c73c7a.
  Vanilla IDF5.3.4 private driver files differ. Shared toolchain is preserved
  under the audio baseline's `build/firmware-toolchain`.
- Current app reference: `/tmp/loo-ume-ddp-rate-control`, review44. Built-in
  effects and MadMapper both use simulator→DDP; do not send MadMapper directly
  to WLED or rebuild an already-completed forwarding pipeline.
- Use one bounded implementation slice at a time, narrow `rg`/reads and focused
  tests. Reuse existing harnesses. No repeated broad audits, constant device
  polling, speculative flashes or default parallel agents. Follow AGENTS.md
  cost routing; use additional review only for a concrete high-risk seam.
- Build in isolated copies/caches. Generate compiledb BEFORE final build;
  validate final ELF/image and fallback hashes. Use toolchain `core/penv/bin/python`
  for esptool. Existing remote-push approval restriction is unresolved: save
  local commits, do not bypass it or merge main.

**Every attended physical test:** one intended variable; private before/after
config/map/state; explicit prediction;90s settling; announce60s start and stop;
no polling/preview during the count. Check absolute clock after interruptions.
Record actual duration or label intervals as estimates. Leave the test available
long enough for feedback; state the restore point. If behavior varies, repeat
at5minutes before classifying stability. Software FPS/CRC is not physical proof.

**Order of work:** while away, FIRM-036 and then037 can be prepared. When the
operator returns, close035's restore step and run038. Then039 tests the guarded
DMA path,040 resolves moving-frame delivery,041 restores audio,042 checks mode
transitions and043 provides sustained acceptance/recovery evidence. A persistent
signal fault from038/039 must be resolved before a clean-output claim.

**Current continuation:** GPT-6 Astra owns FIRM-036 in
`/tmp/loo-ume-ddp-output-diagnostics`, branch `codex/ddp-output-diagnostics`.
The operator confirms quiet periods of 7–10 seconds before flashing returns.
Short quiet periods do not establish stable output. Questions for the operator
remain deferred: available signal measurement equipment, physical chain isolation,
candidate comparison, and standalone microphone response. Leave the device unchanged.

## Control rules

1. Use stable task IDs in commits and handoffs.
2. Lifecycle: **Backlog -> Ready -> In Progress -> Blocked or Human Review ->
   Ready to Merge -> Done**.
3. Keep at most one implementation slice In Progress. Bounded audits may run in
   parallel when their files do not overlap.
4. Record scope, acceptance, dependencies, verification, owner branch/worktree,
   and likely conflicts only when useful.
5. Use FAST by default, STANDARD for substantial normal features, and QUALITY
   for architecture, geometry, conflict, ambiguity, or high risk. Escalate
   Luna -> Terra -> Sol only when evidence requires it.
6. FAST needs orchestrator diff inspection and focused checks. Use an
   independent review when justified in STANDARD and for QUALITY/high-risk work.
7. Completed task-branch work stops at Ready to Merge. Integrate into `main`
   only with explicit operator authorization. After verified integration and
   push, move the task to Done and clean up only task-owned resources.
8. Never force-push, discard unfamiliar changes, or delete another owner's
   branch or worktree.
9. Stop when acceptance criteria and relevant checks pass. Record later ideas
   as separate tasks.

## Backlog

### `P1 · FIRM-036` Prepare a guarded parallel-DMA candidate

- Status: Ready to Merge (offline candidate; physical acceptance remains in039). Owner: GPT-6 Astra; branch `codex/ddp-output-diagnostics`; worktree `/tmp/loo-ume-ddp-output-diagnostics`.
- Result: audio-capable candidate 2609095 guards DMA/front/descriptor/interrupt allocation, releases a failed output group, and reports capacity/failure state. Defaults, original RMT, DDP receiver, and audio code remain unchanged.
- Verification: exact three-step mono-buffer tests passed 140 injected failures and transfer ownership checks. Descriptor tests passed 20 failure/retry cycles. WLED group tests, source guards, firmware build, ELF/source receipt, and independent review passed. All three recovery image hashes match.
- Artifact: `build/firmware-dma-output/wled-audio-dma-guarded-2609095.bin`; receipt and reproduction under `firmware/dma-output/`. No device changes or physical reliability claim. Continue037 offline.
- Implement: existing classic ESP32 X8 I2S1 DMA backend, preserving pins/lengths/map and separate I2S0 mic. No Core downgrade is required. Keep RMT available for comparison/recovery. Do not enable a new default before validation.
- Memory: longest lane needs51408 contiguous DMA bytes plus descriptors and7872front-buffer bytes. Report largest/free MALLOC_CAP_DMA block and actual allocation sizes; total freeheap117KB is insufficient proof. Trace all init/destruct/partial-failure callers. Eliminate null-buffer memset and unsafe use after failed allocation; propagate failure so HTTP/config recovery remains available, no boot loop or fake successful bus.
- Tests: actual allocation failure injection, insufficient contiguous block, partial lane init/cleanup/retry, normal four-lane init, mono-buffer ownership (never edit active DMA), all lanes updated before start, reset/pulse encoding and bounds at704/640pixels. Verify exact compiled I2S1 path and recoverable RMT fallback. Add only low-cost task-context telemetry; no per-pixel logging.
- Deliver: isolated build/receipt, image integrity, exact patch/source hashes and memory-budget report including audio and prospective DDP buffers. Keep microphone initially uninitialized for backend isolation; audio-capable build may use disabled/type255 until041. Use actual callbacks/ABI from pinned source, not a new private SDK override by release label.
- Gate: candidate must be reviewable and memory failures safe before drv1 is selected. Allocation guards alone do not establish physical reliability.

### `P1 · FIRM-037` Make LOOUME's driver contract explicit

- Status: Ready (offline; execute after036's bounded slice). Scope: support selected drv1 without losing exact mapping checks; preserve existing drv0 projects and firmware bundles.
- Inspect `src/wled/DeploymentContract.ts` (drv0 generation/validation) and `web/src/Esp32Setup.ts` (read-back compare); verify current app branch before editing. Record driver preference in the relevant authored/deployment contract, generated setup, validation and reconnect. Keep GPIOs, starts, counts, map identity and current limits authoritative. Do not silently accept any arbitrary config or report I2S as RMT.
- Tests: existing RMT project reconnect, explicitly selected DMA reconnect, changed GPIO/length/map still rejected, driver round-trip/save/load, setup read-back and restart, original order retained. One simulator→DDP pass must remain intact for built-in and MadMapper sources.
- Deliver: focused checks and reviewable app build using repository packaging workflow; retain review44 recovery. Remote publication remains subject to existing restriction. No broad UI redesign or requirement that operator reapply a project to conceal mismatch.

### `P1 · FIRM-038` Distinguish GPIO22 output from its downstream chain

- Status: Human Review (operator present required; next physical isolation). First restore035's exact original configuration/order and verify DDP reconnect. Same Solid/FPS/brightness; count each GPIO after settling.
- If controller data leads are accessible and the operator can perform the check: label the physical chains, remove power before touching wiring, swap onlyGPIO17/22 chain data leads at the level-shifter outputs. Both chains are640pixels and must receive identical Solid. Do not change power rails or open the sculpture unnecessarily. Restore leads before moving/addressed content.
- Prediction: original physicalGPIO22 chain still flashes when driven byGPIO17 → downstream cable/panels/power more plausible. Fault followsGPIO22/shifter output onto the other chain → controller output/level-shifter path more plausible. Both/neither is inconclusive. Label physical chains separately from GPIO names after the swap.
- If available, capture a good output andGPIO22 at ESP32 pin, level-shifter output and first-panel DIN. Compare repeated decoded bytes, pulse/reset timing and electrical levels. Logic-only capture cannot establish voltage margin; prefer scope for signal quality. Do not infer panel failure or demand unavailable equipment. If unavailable, record this limit and continue controlled DMA comparison without claiming electrical exclusion.
- Exit: restore/verify wiring and map, record outcome. The old repairedGPIO17 solder fault is distinct and must not be reused as a blanket explanation.

### `P1 · FIRM-039` Compare RMT and DMA on repeated Solid

- Status: Backlog. Dependencies:036/037 prepared,038 result/limits recorded, operator present.
- Use one guarded candidate for RMT vs DMA comparison, diagnostics off and audio source uninitialized in both. All four homogeneous outputs must be drv1 together for parallel I2S1; retain original order and per-pin config. Verify real backend, all2624pixels/four lanes, contiguous allocation, no placeholder buses, reset/clock and responsive HTTP recovery.
- Test the identical existing Solid at fixed30FPS first;90s settle,60s counts, then repeat at5minutes. Repeat primary red/green/blue and a fixed asymmetric spatial pattern at the same brightness. Return to same-candidate RMT when needed to check time variation; do not perform an endless A/B loop. Log actual TX rate separately from sender FPS.
- Decision: clean DMA supports adopting the output backend; persistentGPIO22 routes back to038 and/or targeted encoded-buffer/wire capture. Do not add another audio-shutdown patch. Additional probes need a specific predicted observation and a probe-off control.
- Acceptance: no observed wrong-color/black flashes across the agreed windows, correct addresses, stable memory and no resets. Report residual counts honestly and leave the goal open if they persist. Preserve fallback085 and exact settings recovery.

### `P1 · FIRM-040` Add complete-frame DDP buffering with parallel DMA output to WLED

- Status: Backlog; offline harness work can follow036/037. Physical acceptance depends on039's stable output.
- Operator request: combine complete-frame buffering with the guarded parallel DMA output from FIRM-036 inside WLED. Preserve standalone audio effects.
- Frame boundary: start a complete frame at a controlled interval after the previous DMA transmission finishes. Keep output data unchanged during transmission.
- WS2812 has no external VSYNC input. Use DMA completion and the required reset interval to control the software frame boundary.
- Recovery: discard incomplete frames and restore the saved standalone effect after the DDP timeout. Verify memory capacity for DMA, frame buffers, and audio.
- Limit: buffering and DMA do not exclude signal or downstream hardware faults. Physical checks must confirm the combined result.
- Reuse audit `/tmp/loo-ume-firmware-ddp-audit/docs/FIRMWARE_DDP_AUDIT.md` and experimental `/tmp/loo-ume-ddp-frame-boundary` (7ebf577). Its24.87 submissions/s is a diagnostic result, not baseline throughput; original rejection coincided with subsequently repaired hardware. Do not blindly reinstall it.
- Trace network callback→PUSH→segment→bus ownership. Assemble/validate complete7872-byte RGB frames before publishing. Define bounded ready/in-flight ownership, incomplete-frame discard, sender restart, sequence wrap/zero semantics, timeout and latest-frame replacement under overload. Avoid boolean PUSH coalescing and autonomous native repaints presenting partial data. Keep native effect lifecycle correct on DDP exit.
- Tests: real receiver/service harness with full6-packet frames; delayed/lost/duplicate/reordered/truncated packets; missing PUSH; sequence wrap/restart; frame-boundary publication while output busy; no deadlock/starvation or active-buffer mutation. Count received complete, invalid/incomplete, intentional superseded, presented and TX-completed separately. Fit frame buffers inside measured DMA+audio memory budget.
- Physical: slow moving scan/gradient that reveals discontinuities, then faster/high-change content at30FPS and40FPS separately. Test built-in LOOUME and MadMapper→LOOUME through the same pass; effect changes, stream stop/start and reconnect. Sample before/after metrics, no continuous previews during visual windows. Use recorded/high-frame-rate video if available for objective gaps; don't require it for basic progress.
- Acceptance: no new corrupt pixels at effect changes; steady complete-frame cadence at30FPS without systematic whole-sculpture drops.40FPS only if rendering+encoding+21.42ms wire time permit it. Separate unavoidable network loss/intentional latest-frame drops from scheduling defects. Do not claim47FPS solely from WLED or host counters.

### `P1 · FIRM-041` Restore and validate standalone audio on the selected backend

- Status: Backlog. Dependencies:036 memory budget,039 stable output,040 delivery validation or separately documented remaining work; operator present.
- Restore original AudioReactive settings from the private restore file and reboot an audio-capable candidate. Confirm actual I2S0 capture/FFT processing, GenericI2S type1, SD32/WS26/SCK27/MCLK-1. Verify LED DMA uses I2S1, no shared peripheral/pin conflict. Test with LOOUME fully closed and info.live=false.
- Compare native non-audio motion, then known Gravimeter132 and several contrasting available audio effects. Test silence, normal sound, stronger sound and recovery; check microphone response, all four chains, wrong colors, motion pauses, clipping/AGC and memory headroom. Select effect IDs from the actual firmware list; reuse the existing audio dropdown work.
- Acceptance: sustained responsive standalone audio without observed flashes, crashes or periodic pauses; native brightness/preset restored after power cycle. Settings persistence and microphone initialization must be verified, not inferred from an audio-enabled binary.

### `P1 · FIRM-042` Validate DDP/audio transitions and overload recovery

- Status: Backlog. Dependencies:040/041; operator present for visual/audio acceptance.
- First test DDP with microphone capture still enabled on the separate peripheral. Do not disable/reinstall audio unless measured resource contention justifies it. Audio may be unavailable during DDP, as operator authorized, but must recover on exit.
- Run standalone audio→DDP30→stop/timeout→audio; repeat with40FPS if supported. Test effect changes, sender app quit/relaunch, Wi-Fi interruption/reconnect, explicit override and controller restart. Progress1→5→20 transitions after successful checks; capture state/heap/errors at endpoints. No RMT/I2S resources left orphaned and no downward heap trend.
- If suspension is needed, base it on measured scheduling/memory evidence; verify capture/FFT shutdown and sample-boundary resume, pin/driver ownership and failure recovery. Do not reuse rejected2609082/091/092 merely because unit tests passed.
- Acceptance: correct saved standalone preset/brightness, normal mic response after timeout, first resumed frames clean, no stalls/boot loops/ghost DDP source, all chains consistent. Report separately whether audio must stop during DDP.

### `P1 · FIRM-043` Sustained acceptance, recovery and final handoff

- Status: Backlog. Dependencies:039–042; operator available to define/observe final acceptance.
- Run each selected mode for at least30minutes: Solid, moving DDP at accepted FPS, standalone audio. Record start/end and an observation at5minutes; extend to an hour if earlier faults appeared intermittently. Count flashes by chain, visible/recorded discontinuities, controller resets and stream interruptions. Monitoring must be bounded and its overhead stated.
- Repeat after controller/LED power cycle and LOOUME restart; confirm exact driver/project/map/preset/audio settings. Verify documented rollback image and complete config restore remain available, without needlessly flashing the fallback again.
- Final record: one chosen firmware/app/config set with hashes, tested FPS/brightness/content, microphone wiring, transition behavior, physical durations/counts and remaining limits. Zero observed flashes is scoped to those tests, not a guarantee. Any accepted nonzero rate needs the operator's explicit acceptance; never quietly redefine success.
- Commit scoped changes locally; push/merge only through the permitted workflow. Update this quick-start state and `/home/mate/WLED-AUDIO-DDP-HANDOFF.md`, removing stale active-test instructions. Mark the overall goal complete only after both DDP motion and native audio meet the recorded acceptance.

### `P1 · FIRM-035` Isolate output allocation from the physical GPIO22 path

- Status: Human Review (result received; restoration deferred while operator is away). Owner: Codex; branch `codex/output-order-test`; worktree `/tmp/loo-ume-output-order-test`.
- Scope: user reports persistentGPIO22 flashes after power cycling2609094 with probes off. Perform a reversible configuration-only swap of theGPIO17/22 bus entries, retaining every per-pin setting and address range. Preserve firmware and all fallbacks. Independently inspect a DMA backend as a possible route to reliable DDP and native audio.
- Acceptance: source confirms bus allocation follows list order while pixel addressing uses explicit start/length; private backup and exact restore; read-back changes only list order with probes off and DDP active;90s settling then explicit60s feedback window; restore and verify original LOOUME contract after the test. No diagnosis from merely improved appearance.
- Plan: review source and reconnect constraints; prepare guarded apply/restore and address equivalence proof; verify changed RMT-to-GPIO allocation; run timed observation; restore original ordering; record evidence and next architecture decision. No new flash in this test.
- Interpretation: movement towardGPIO17 supports an allocation/scheduling-related cause; persistentGPIO22 points toward a pin/chain-specific path but does not prove electrical failure. Order also changes allocation addresses and launch order, so this does not isolate the hardware RMT block alone. Native audio and moving-frame delivery remain required later acceptance tests.
- Conflicts: TASKS.md, firmware/output-order/. Independent reviewer is read-only on existing firmware sources.
- First run: configuration-only allocation swap applied and verified; first timed visual window was unreported. Full original cfg.json then restored through supported upload/reboot, including inactive audio options omitted by the non-audio serializer. Original ordering/map/segment state and DDP verified. DMA architecture review found existing I2S1 output alongside I2S0 audio; capacity guard and explicit LOOUME drv1 contract are required before rollout. See firmware/output-order/README.md. No flash.
- Repeat: user requested the allocation test again. Fresh private run `build/repeat-20260909-091533`; applied09:16:26.502UTC and verified intended allocation/per-pin mapping with DDP active and probes off.90s settling then explicit60s observation. Initial plan was restore after feedback; subsequent instruction to keep this running while the operator is away defers restoration. First-run evidence remains unchanged.
- Repeat result: announced around09:18:00UTC; clock start09:18:06, nominal stop09:19:06; finish announced and ending read-back passed. User reportsGPIO22 every1–4s,GPIO16 about6s, other chains solid. It did not move toGPIO17. User is leaving and wants this running; leave current allocation active and defer exact restore until an attended test. No restoration for this repeat yet.

### `P1 · FIRM-034` Measure submitted pixels and RMT refill timing

- Status: Ready to Merge (diagnostic completed; flicker/audio/frame-drop goal remains open). Owner: Codex; branch `codex/rmt-output-probe`; worktree `/tmp/loo-ume-rmt-output-probe`.
- Scope: user-authorized diagnostic2609094 based on2609093. Add runtime-controlled payload fingerprints and fixed DRAM RMT timing/status counters. Retain300us reset, original non-audio receiver, bus configuration and IRQ policy. Preserve2609085 and other controls.
- Acceptance: match installed SDK source/ABI for driver probe; no ISR logging/allocation/CRC; no public/private handle guesses; measure probe cost; verified ELF/receipt and original controller settings;90seconds settling then a clearly marked60-second observation with feedback requested afterward.
- Plan: validate SDK provenance independently; implement task-context payload checks and bounded telemetry; instrument exact transmitter; build/review and verify; install and run timed physical/telemetry comparison. No diagnosis from80us callback gaps alone.
- Conflicts: TASKS.md and firmware/rmt-probe/. Separate reviewer owns only `/tmp/loo-ume-rmt-probe-sdk-audit`.
- Verification: host fault-injection tests, exact private ABI assertions, final LTO source ownership, ISR IRAM/DRAM checks, retained bit/reset timing, image checksum and independent review passed. Installed2609094; full config exceptvid, map and brightness verified unchanged at installation and final read-back; DDP active. Three fallback hashes intact. Timing-only, measurement-off and separate CRC samples completed. CRC remains a separate measurement because it can change channel start spacing.
- Result: timing-on user estimatesGPIO22 every1–2s andGPIO16 every4–5s. Sparse verified late refills do not explain the full observed rate. After90s settling with measurement off, user reportedGPIO22 every1–2s and no flashes on other outputs during the explicitly timed minute. Separate~57.68s CRC sample found2646completed comparisons/output with no changes or mutations. Collection off again08:51:32.746UTC; full evidence/limits in firmware/rmt-probe/RESULTS.md. Original fallback2609085 preserved. Save commits locally; remote push remains subject to the existing unresolved approval rejection and is not retried.

### `P1 · FIRM-033` Isolate the encoded RMT reset interval

- Status: Ready to Merge (diagnostic completed; residual flashes remain). Owner: Codex; branch `codex/rmt-reset-gap-test`; worktree `/tmp/loo-ume-rmt-reset-gap-test`.
- Scope: prepare non-audio diagnostic 2609093 from the original 2609051 recipe, changing only the RMT reset to the selected speed's duration (300 microseconds for installed RGB buses), plus the diagnostic build ID. Preserve both original images.
- Acceptance: exact pinned-source guards; unchanged original non-audio build flags, 128 symbols, IRQ priority, callback placement and DDP receiver; compiled ELF confirms the 300-microsecond reset; application receipt and explicit physical comparison before any stability claim.
- Plan: prepare guarded source patch; build from a separate source tree; verify flags, source delta and compiled reset; compare the same Solid stream against 2609051 when installed. No frame-drop fix is claimed by this reset test.
- Conflicts: TASKS.md and firmware/reset-gap/. No edits to baseline firmware source or artifacts.
- Verification: guarded patch checks, pinned source comparisons, original flags/tool versions, no compiled audio, and firmware build passed. ELF confirms two 6000-tick low fields at40MHz (300us), unchanged data pulse literals, and original flash-resident callback. Independent timing/scope review passed. Installed2609093 via validated OTA; full configuration matches2609051 except build ID, map and brightness unchanged, DDP active. Both original image hashes verified intact.
- Physical result: latest estimate is flashes every2–3seconds onGPIO16 andGPIO22, other chains clean; earlier estimates varied from1–2seconds to3–5seconds and GPIO22/PC02 was predominant. Read-back at uptime484s confirmed2609093, unchanged full config/map and DDP active. The intended60-second observation window overran after an interruption, so these are frequency estimates, not exact timed counts. Residuals remain unacceptable; no frame-drop improvement can be inferred from Solid. Original images and audio restore preserved. Independent measurement design and future feedback protocol are in firmware/reset-gap/MEASUREMENT_PLAN.md. No instrumentation is built or installed yet.
- Delivery: source/receipt and diagnostic result saved locally. Publication remains local because the prior repository publication review is unresolved; no remote write attempted.

### `P1 · FIRM-032` Compare firmware using repeated solid DDP frames

- Status: Ready to Merge (comparison documented; flicker and frame drops remain unresolved). Owner: Codex; branch `codex/firmware-solid-comparison`; worktree `/tmp/loo-ume-firmware-solid-comparison`.
- Scope: document the operator-authorized tests following FIRM-031; preserve both original firmware artifacts and configuration backups. No firmware source changes.
- Acceptance: distinguish identical-frame corruption from ordinary frame mixing; compare timer suppression, audio excluded at boot, and original non-audio firmware; verify device identity, LED/realtime settings, brightness and map after each change. Record physical observations without claiming a fix from software read-back.
- Conflicts: TASKS.md and docs/FIRMWARE_DDP_AUDIT.md. The implementation/audit task branches remain preserved.
- Result: timer suppression did not remove flashes; booting 2609085 with no audio source reduced them but did not remove them. Original 2609051 also produced occasional flashes: predominantly whole-chain black/blue frames on GPIO16, fewer than the multiple blue lines seen with audio. This replaces the assumption that non-audio eliminates all flashes under current conditions. Both artifact hashes are unchanged. See the audit's follow-up results.
- Verification: full configuration/map comparisons for reversible settings tests; original LED/realtime configuration, map and brightness verified after OTA. Three solid preview runs each sampled 34,960 identical `ff3201` pixels. Operator supplied physical observations for all comparisons. Original microphone settings must be restored and the controller rebooted when returning to 2609085.
- Delivery: documentation only, no production changes or new firmware build. Publication remains local because repository publication review from the prior task is unresolved; no remote write attempted.

### `P1 · FIRM-031` Independently audit DDP ownership and timing

- Status: Ready to Merge (audit only; physical diagnosis remains pending). Owner: Codex; branch `codex/firmware-ddp-audit`; worktree `/tmp/loo-ume-firmware-ddp-audit`.
- Scope: read-only controller inspection, exact-source host reproductions, and a testable diagnosis before any new flash. Preserve 2609085 source and application image.
- Evidence: native/audio playback is clean on 2609085; DDP flashes remain. Capture stop and cooperative driver unload worsened DDP; GPIO16 length reduction spread flashes. Repaired TX2 fault is separate.
- Acceptance: identify demonstrated software behavior separately from unconfirmed physical causes; trace receiver, segment, bus and RMT ownership; inspect frame pacing and audio differences; prepare discriminating tests. No firmware or controller configuration changes.
- Conflicts: TASKS.md, firmware diagnostic documentation/scripts. QUALITY review includes a bounded independent RMT audit.
- Result: compiled 2609085 uses a 50-microsecond reset despite selected Ws2812x declaring 300. Sequential bus scheduling makes this a leading explanation for longest-chain corruption and spread after equalizing lengths. Exact-source host harness reproduces four complete-frame ownership failures and verifies the native-timer diagnostic. Normal NeoPixelBus transmit-buffer ownership was independently checked; no active payload overwrite was demonstrated. See `docs/FIRMWARE_DDP_AUDIT.md` for evidence, caveats and no-flash tests.
- Verification: five host checks passed; source and ELF inspected; fallback SHA-256 and read-only controller state verified. No firmware, configuration or pixel-stream writes. Audit saved locally; repository publication authorization review was already unresolved from the prior task, so no new push was attempted.

### `P1 · FIRM-028` Isolate AudioReactive RMT callback placement

- Status: Human Review (built, not installed; baseline recovery pending). Owner: Codex; branch `codex/audio-rmt-iram`; worktree `/tmp/loo-ume-audio-rmt-iram`.
- Scope: move the template-independent RMT refill callback into one non-template IRAM function on original AudioReactive firmware, build 2609085. Preserve original DDP receiver, priority, 128-symbol allocation and audio lifecycle.
- Evidence: original callback is flash-resident; merely adding IRAM_ATTR to the templated method did not change placement, as verified from the ELF. Receiver rewrite and prior audio experiments failed physical tests and were rolled back to 2609051.
- Acceptance: exact patch guards and unchanged callback body; verify compiled refill, bytes and copy callbacks in IRAM; pinned build receipt; operator baseline recovery before another hardware comparison. Original no-audio rollback retained.
- Verification: callback body equality and patch rejection checks passed; build and receipt passed; shared callback and IDF bytes/copy callbacks are in IRAM, old template callbacks absent. Candidate 2609085 not installed. GPIO 17 remained corrupted on verified rollback 2609051 with DDP off and native segment unfrozen; operator asked to power-cycle controller and LEDs before further testing.

### `P1 · FIRM-018` Recover USB Improv setup without an application restart

- Scope: investigate Improv detection failure after changing ESP32 boards during one application session.
- Evidence: BOOT was released. Restarting LOO/UME allowed setup to complete on the replacement board.
- Acceptance: recover from a timeout and board change without an application restart or an unhandled promise rejection.
- Checks: test serial cleanup, pending requests, timers, and a successful next attempt with two boards.
- Status: deferred by the operator. See F-166 in `FAILURES.md`; no software correction is confirmed.

### `P2 · REVIEW-020` Correct structural generation for saved examples

- Deferred by the operator. Ribbon junctions and surface bridges can intersect
  DOUT clearance. Some surface junctions produce degenerate triangles.
- DEV-020 retained 15 geometry test failures, including older hole/address
  expectations and blocked-anchor fixtures. The unchanged Node compiler also
  rejects the spatial-trail browser fixture at a DOUT clearance.
- Acceptance: affected saved examples compile, or clearly state unsupported
  geometry. Keep physical clearance and mesh validation checks.

### `P2 · REVIEW-021` Protect unsaved project changes

- Deferred by the operator. Project replacement and window closure can discard
  edits without a warning.
- Acceptance: track unsaved changes and confirm discard before replacement or closure.

### `P2 · REVIEW-022` Reject obsolete asynchronous project results

- Deferred by the operator. Generation and surface loading can apply an old
  result after the active project changes.
- Acceptance: bind results to project revisions and cancel obsolete operations.
- DEV-020 guards its new worker results. Surface loading and older HTTP fallback
  operations remain in this task.

### `P2 · REVIEW-023` Align firmware support across launch commands

- Deferred by the operator. Vite omits firmware routes. Local desktop and Mac
  packaging commands do not prepare their required firmware image.
- Acceptance: supported commands expose or prepare the verified image consistently.

### `P2 · DEV-021` Extend stricter Node and boundary lint checks

- Priority: after DEV-020. Both TypeScript projects already use strict mode.
  DEV-020 adds return and switch checks. A trial of Node indexed-access and
  unused-code checks found about 40 diagnostics, mostly in older tests.
- Scope: resolve those diagnostics without broad test rewrites. Assess
  `exactOptionalPropertyTypes` and selected unsafe-value lint rules separately.
- Acceptance: the added checks pass and detect useful defects without duplicate diagnostics.

### `P2 · DEV-022` Gate affected geometry and browser changes before merge

- Dependency: REVIEW-020 must establish a passing geometry baseline first.
- Scope: select relevant geometry and browser checks for pull requests. DEV-020
  adds fast behavior checks to each normal build. CI-027 keeps full regression
  available manually while the P2 failures remain deferred.
- Acceptance: source and fixture changes select the required checks. Files read
  dynamically must not disappear from dependency-based test selection.

### `P2 · DEV-023` Measure remaining test and asset preparation costs

- Priority: after DEV-020. Trial two browser workers only after tests with shared
  UDP receivers have separate ownership. Measure repeated mapping-fixture setup
  and source-asset staging before adding caches.
- Acceptance: demonstrate lower repeated-check time with unchanged coverage and
  correct invalidation. Keep one canonical mapping fingerprint check. Prefer
  contract relationships over repeated fixture-specific constants elsewhere.

### `P1 · FIRM-016` Set up official WLED firmware for supported ESP32 targets

- Scope: replace the packaged single-target image with official stable WLED
  images. Detect the connected ESP32 target, download its pinned image during
  setup, verify it, and keep a local cache. Run the complete setup from the
  Electron DMG.
- Operator expectation: connect any ESP32 target that official WLED supports.
  Start one setup action. LOO/UME selects and flashes the correct WLED image,
  provisions Wi-Fi, and configures the loaded Simulator sculpture.
- Acceptance: serial selection does not depend on one USB bridge; bootloader
  detection occurs before erase; an application-controlled manifest binds each
  supported target to official WLED URLs, flash parts, offsets, version, size,
  and SHA-256 values; a verified cache supports later offline setup; the setup
  checks target capacity and safe GPIOs before erase; unsupported capacity
  produces one exact explanation; successful setup installs buses, GPIOs,
  ledmap, boot preset, and DDP behavior from the loaded Simulator sculpture;
  post-flash readback verifies the installed target and configuration.
- Dependency: integrate FIRM-015 serial selection and package correction first.
- Review: use QUALITY mode. Test manifest rejection, download failure, cache
  corruption, wrong-target rejection, erase boundaries, recovery, and physical
  setup on each supported processor family.
- Likely conflicts: Electron serial selection, ESP32 setup, firmware receipts,
  hardware profiles, release downloads, cache storage, and setup tests.

## Ready

No tasks.

## Ready to Merge

No tasks.

## Done (latest integrations)

### `P0 · FIRM-019` Enable four ESP32 LED outputs

- Result: build `2609051` allocates 128 RMT symbols per output. The operator confirmed GPIOs 16, 17, 21, and 22.
- Delivery: integrated into `main` at `8b27334` with operator approval. Mac version `0.1.34` includes the verified USB image.
- Verification: 62 tests, four browser tests, full lint, full typed lint, TypeScript, firmware integrity, and Electron builds passed.
- Mac verification: [build 34](https://github.com/MateSteinforth/LOO-UME/actions/runs/33981301983) passed package, signature, launch, GPIO, reconnect, and credential checks.
- Download: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-macos-unsigned/LOO-UME-Electron-arm64.dmg).
- Evidence: `firmware/build-receipt.json` records the exact sources and images. Local test records are under `build/firmware-rmt4-2609051`.
- Limits: extended stability and complete sculpture address parity remain untested. The device became unreachable before the previous animation could be restored.

### `P0 · LIVE-024` Restore the project before ESP32 reconnect

- Result: save the verified project ZIP before new reconnect authorization. Restore the ZIP before discovery and report exact configuration differences.
- Delivery: integrated into `main` at `8b27334` and included in Mac version `0.1.34`.
- Verification: host persistence, failed snapshot replacement, replacement GPIO startup, and invalid snapshot recovery checks passed.
- Limit: operator review of installed-application reconnect remains.

### `P1 · WIFI-028` Simplify repeated ESP32 setup

- Result: add Wi-Fi scan controls and encrypted desktop credential storage. Keep manual network entry and firmware selection available.
- Delivery: integrated into `main` at `8b27334` and included in Mac version `0.1.34`.
- Verification: browser controls and native Mac credential encryption, restart restoration, and deletion checks passed.
- Limit: physical Wi-Fi scan review remains. FIRM-018 records the separate Improv timeout.

### `P1 · LIVE-029` Recover Art-Net input without restarting

- Result: silent Art-Net input reopens automatically after three seconds. Explicit stop cancels pending retries.
- Verification: 15 Art-Net tests, full lint, and TypeScript passed. The real UDP startup-order test fails with the previous client.
- Delivery: the operator confirmed review DMG 32 works and authorized integration and task cleanup on 2026-09-05.
- Mac verification: [build 32](https://github.com/MateSteinforth/LOO-UME/actions/runs/33980162768) passed packaging, signature, launch, GPIO, and reconnect checks.
- Implementation: `60426e8`. Includes MAD-015. The Wi-Fi review work remains separate.

### `P1 · MAD-015` Correct fixture sampling positions

- Result: small fixtures sample the LED coordinates. The 2:1 frame and physical addresses remain unchanged.
- Verification: 14 exporter, package, and preview tests passed. The center tests fail against the previous exporter.
- Delivery: included in the accepted review DMG 32 and the LIVE-029 integration.
- Implementation: `6a78c8c`. Existing MadMapper fixtures need replacement with a fresh export to use the correction.

### `P1 · CI-027` Correct repeated clean-checkout alerts

- Owner: GPT-6 Astra; branch `codex/fix-clean-checkout`; worktree `/tmp/loo-ume-clean-checkout`.
- Finding: scheduled run `33951147725` completed bootstrap setup but failed the full test suite. Broad browser regression also failed.
- Scope: retain deferred P2 geometry work. Run focused daily checks and keep full regression available through a manual workflow input.
- Acceptance: clean setup and managed-runtime fast and host tests pass. The default CI run uses the same checks as the schedule.
- Browser scope: planar generation and ZIP reopen, structural worker generation, mechanics-free authoring, wiring rotation, and manual GPIO settings.
- Mac scope: remove the Intel setup job to match the Apple Silicon-only rule.
- Limit: this change does not repair deferred geometry or broad browser regression failures.
- Corrections: use `origin/main` for manual source comparison; update the Apple Silicon bootstrap test; allow a newly spawned launcher child to reach exec.
- Local checks: clean setup, 510 fast and host tests, source checks, and all 19 launcher tests passed. The new regression detects the original startup race.
- Final verification: all eight jobs passed in [run 33954580828](https://github.com/MateSteinforth/LOO-UME/actions/runs/33954580828), including clean-checkout and browser smoke.
- Integration: apply this correction to `main` under the operator's ongoing latest-main request. Remove only this task's clean merged worktree after the push.

### `P1 · INT-026` Integrate the latest completed application changes

- Owner: GPT-6 Astra; branch `codex/integrate-latest`; worktree `/tmp/loo-ume-integrate-latest`.
- Scope: combine DEV-020, DEV-024, DEV-025, LIVE-022, and LIVE-023 into `main`.
- Acceptance: preserve manual GPIO fields, reconnect persistence, development checks, workers, and Apple Silicon package signing.
- Checks: source checks, relevant unit and browser tests, production builds, and the Mac package launch check.
- Conflicts: browser orchestration, Electron startup, and task and failure records.
- Authorization: the operator requested integration into `main`. Retain deferred P2 defects and physical hardware review.
- Result: integrated the complete branch chains without changing measured geometry or deferred P2 scope.
- Verification: 586 tests passed. The 15 existing geometry failures match the earlier DEV-020 report; no new failures appeared.
  Five browser journeys, formatting, lint, type-aware lint, TypeScript, production builds, and workflow validation passed.
- Mac verification: run `33953179437` checked the DMG signature, ARM64 launch, four GPIO edits, and reconnect authorization across restart.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-27/LOO-UME-Electron-arm64.dmg).
- Cleanup: remove this task's integrated temporary worktrees and branches after the main push. Preserve the separate LIVE worktrees and simulator-generation branch.

### `P1 · DEV-025` Correct Mac review signing

- Owner: GPT-6 Astra; branch `codex/mac-review-signing`; worktree `/tmp/loo-ume-mac-signing`.
- Scope: apply an ad-hoc signature and verify the packaged Mac application before publication.
- Acceptance: signature verification and a packaged editor launch pass on Apple Silicon.
- Dependency: includes DEV-020 and DEV-024. Apple notarization credentials are not configured.
- Conflicts: Mac workflow, review entitlements, and package checks.
- Checks: workflow validation, script syntax, DMG signature, ARM64 architecture, and packaged editor launch passed.
- Delivery: run `33952586743` built commit `86c6018`.
  [Download review 26](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-26/LOO-UME-Electron-arm64.dmg).
- Limit: the runner launch does not prove Gatekeeper approval on the operator's Mac. This review has no Apple notarization.

### `P1 · DEV-024` Build Apple Silicon Mac packages

- Owner: GPT-6 Astra; branch `codex/apple-silicon-dmg`; worktree `/tmp/loo-ume-apple-silicon`.
- Dependency: includes DEV-020 from `codex/dev-iteration`.
- Scope: build ARM64 packages and align package checks and download metadata.
- Acceptance: the Mac workflow produces a verified Apple Silicon review DMG.
- Conflicts: Mac release workflow, package command, update metadata, and download documentation.
- Checks: 12 package and desktop tests, TypeScript, and YAML validation passed.
- Delivery: Mac run `33952253932` built commit `c08bafd` and verified the packaged firmware.
  [Download the review DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-25/LOO-UME-Electron-arm64.dmg).
- Mac launch and GPIO checks now pass under INT-026. Physical device review remains separate.

### `P1 · DEV-020` Reduce development checks and repeated builds

- Owner: GPT-6 Astra; branch `codex/dev-iteration`; worktree `/tmp/loo-ume-dev-iteration`.
- Priority order: formatting and fast lint; separate TypeScript and typed lint;
  focused test groups and reliable browser ownership; incremental Electron;
  browser generation worker and a smaller generation interface in `main.ts`.
- Acceptance: documented fast checks pass without asset builds; test arguments
  reach Vitest; complete tests remain available; Electron reuses Vite and watches
  main-process code; browser generation uses the same compiler in a worker.
- Conflicts: package/configuration files, Electron startup, browser generation,
  test configuration, and development documentation. Other worktrees remain unchanged.
- Deferred: the four REVIEW-020 through REVIEW-023 problems above. Do not change
  measured geometry to resolve existing test failures.
- Review: independent review plus worker browser checks and Electron lifecycle checks.
- Result: Prettier, cached syntax lint, typed lint, strict return/switch checks,
  and separate fast/geometry/host tests are available. CI runs source and fast
  behavior checks. Brittle text and mutable-fixture assertions were corrected.
- Result: Electron development keeps Vite running and watches its main process.
  Planar and structural generation use a worker with classified errors and
  transferred asset buffers. New worker results have a project revision guard.
- Verification: 388 fast tests passed in about 15 seconds on this host while
  source checks also ran. All 117 host tests passed after correcting a
  stale demo-library assertion and removing a formatting-sensitive UI string check.
  Formatting, complete lint, TypeScript, web/Electron builds, WASM integrity,
  and workflow YAML checks passed. Chromium verified planar generation and ZIP
  reopen, structural generation and download, and mechanics-free editing.
- Limits: the complete suite still contains the deferred geometry failures.
  Electron startup, watched restart, and shutdown ran under a virtual display;
  that display blocks Electron WebGL. No physical hardware review was performed.
  The operator authorized integration under INT-026.

### `P0 · LIVE-023` Configure replacement ESP32 output GPIOs

- Result: Developer utilities shows one field for each current output. It saves
  unique approved ESP32-WROOM pins without changing routes or address order.
- Verification: 53 focused unit tests, the GPIO browser journey, application
  TypeScript, production web build, and diff checks passed.
- Dependency: this branch includes LIVE-022 so physical review keeps automatic
  reconnect. INT-026 integrates LIVE-022 with this task.
- Owner: Codex on `codex/live-023-custom-gpios` in
  `/tmp/loo-ume-live-023-custom-gpios`.
- Remaining review: set GPIO 16, 17, 21, and 22. Run ESP32 setup once. Confirm
  that all four physical chains receive their correct frames.

### `P0 · LIVE-022` Persist Electron ESP32 reconnect authorization

- Result: successful setup records reconnect authorization in Electron
  application data. A later process reads it across random loopback ports.
- Verification: the random-port restart regression, ESP32 setup tests,
  Electron tests, application TypeScript, focused Node TypeScript, Electron
  bundling, the production web build, and diff checks passed.
- Owner: Codex on `codex/live-021-persistent-reconnect` in
  `/tmp/loo-ume-live-021-reconnect`.
- Remaining review: restart local Electron after one successful setup. Confirm
  that LOO/UME finds `loo-ume.local` and enables the sculpture mirror.

### `P0 · FIRM-015` Include the verified ESP32 image in the Mac application

- Result: the Electron release includes the receipt-bound ESP32 image. CP2102
  selection, flashing, Wi-Fi provisioning, configuration, and responsive DDP
  sending passed physical Electron review.
- Verification: focused firmware, serial, DDP, package, TypeScript, Electron,
  workflow, and diff checks passed. Integrated in `main` at `144b83c` on
  2026-09-04.
- Remaining evidence: LIVE-021 owns physical LED reception and address review.

### `P1 · DOC-010` Separate user and development documentation

- Result: the root README now serves application users. Development guidance
  has one entry point at `docs/DEVELOPMENT.md`. Internal README, firmware,
  browser, and roadmap text matches the current repository and interface.
- Verification: local links in all 26 Markdown files, documented npm commands,
  user-content and stale-term guards, and diff checks passed. Integrated in
  `main` at `cc030e9` on 2026-09-03.

### `P1 · INSTALL-018` Repair Mac application placement and reopen lifecycle

- Result: the legacy launcher installs in `/Applications`, reuses only its
  verified service, preserves local projects during updates, and removes only
  managed files. Integrated in `main` at `d59f803` on 2026-09-02.

### `P1 · INSTALL-017` Publish the current Mac launcher automatically

- Result: the legacy launcher workflow publishes reviewed automatic, tagged,
  and manual packages. Electron later replaced this launcher as the primary Mac
  application. Integrated in `main` at `be85989` on 2026-09-02.

### `P1 · MAD-014` Prevent MadMapper fixture overlap

- Result: 2,624 rectangular fixtures cover the fixed 4096 x 2048 atlas without
  interior overlap. Each rectangle contains its LED center. Physical Art-Net
  addresses, mapping fingerprint, authored mapping, and panel poses did not change.
- Verification: 12 focused export/package tests, application TypeScript,
  production web build, diff-check, and native MadMapper review passed. GitHub
  workflow run 33728004432 published Electron review 8 from the task commit.

### `P1 · CTRL-010` Reconcile live-output tasks and stale resources

- Result: direct WLED Art-Net over Ethernet is retired. LIVE-020 now owns the
  selected MadMapper loopback-to-WLAN-DDP path. Speculative blocked tasks are
  removed, and completed launcher tasks are recorded as Done.
- Verification: focused MadMapper export/package tests, application TypeScript,
  production web build, diff-check, and final resource audit passed. Integrated
  in `main` at `6427f57` on 2026-09-03.

### `P1 · MAD-013` Fill the MadMapper atlas with LED Voronoi cells

- Result: 2,624 seam-adjusted LED centers now produce clipped planar Voronoi
  polygons that touch and cover the complete fixed 4096 x 2048 SVG. Several
  cells divide each horizontal edge. Native review then found that MadMapper
  converts these polygons to overlapping rectangles. MAD-014 supersedes this
  fixture geometry. Physical Art-Net addresses, mapping fingerprint, authored
  mapping, and panel poses are unchanged.
- Verification: 12 focused export/package tests, application TypeScript,
  production web build, diff-check, rendered full-atlas inspection, and the
  published unsigned DMG workflow passed.

### `P1 · INSTALL-020` Offer free Electron DMG updates

- Result: each canonical-main unsigned DMG now publishes bounded version,
  commit, size, checksum, and fixed download metadata. A packaged free build
  validates that metadata and shows **Download update** only for a newer numeric
  version. The button opens the approved GitHub DMG; replacement stays manual.
- Verification: nine focused Electron updater/release tests, full TypeScript,
  Electron main build, production web build, workflow YAML validation, and
  diff-check passed. A second later main build is required for the first native
  old-version-to-new-version review.

### `P1 · MAD-012` Keep the MadMapper UV atlas in one 2:1 frame

- Result: the SVG uses one fixed 4096 x 2048 atlas, one global longitude seam,
  and one equal square centered on every individual LED UV coordinate. It no
  longer projects fixture corners per panel or crops the shared spherical map.
  Physical addresses, the mapping fingerprint, and `ledmap.json` are unchanged.
- Verification: 10 focused MadMapper export/package tests, application
  TypeScript, diff-check, and a rendered full-atlas inspection passed. The full
  composite TypeScript check could not resolve Electron types because the
  shared dependency installation predates Electron packaging.

### `P1 · INSTALL-019` Make Electron the default Mac application

- Scope: package the existing editor and local services as one universal
  Electron DMG, with one application-owned window, Project Library, serial and
  network boundaries, local-service lifecycle, and future signed-update seam.
- Result: closing the last window quits the application and local services; a
  later icon launch starts a fresh session. The README points to one stable free
  unsigned DMG. Application-changing canonical `main` pushes refresh that
  prerelease asset, while documentation/test-only pushes skip packaging. The
  earlier Terminal/browser launcher remains available only through an explicit
  legacy tag or manual workflow.
- Verification: focused lifecycle/release/legacy-routing tests, TypeScript,
  Electron main build, GitHub Actions YAML validation, two native universal-DMG
  reviews, canonical-main package inventory and publication, and the normal
  fast verification passed. The stable free download is
  `electron-macos-unsigned`; Apple-signed automatic updates remain optional
  future work, not part of the free installation.

### `P1 · CAL-012` Review and correct the installed physical route

- Scope: add a transactional hardware-review mode that lights one physical
  panel address block at a time with a low-brightness DIN-to-DOUT gradient.
  The operator can accept the expected virtual panel, click a different panel
  in the 3D view, and rotate its installed address calibration in 90-degree
  steps before applying the complete reviewed route.
- Acceptance: hardware review is available only for a current mapping-ready
  WLED link; without that link the same action automatically provides the
  assignment, rotation, and navigation workflow on the virtual sculpture but
  cannot apply or mutate project/device data; one
  complete physical panel block is active and all other LEDs are black;
  every physical slot is assigned to one unique existing panel; rotation
  changes address calibration only; cancel restores live preview without saved
  mutations; apply changes only route panel IDs, installed address transforms,
  calibration/lifecycle evidence, and derived mapping identity. Panel poses,
  mechanics, structural/fabrication data, controller pose, output GPIOs, and
  profile facts remain byte-identical. The proposed diff is visible before one
  final confirmation and the regenerated ledmap is activated and read back
  before live preview resumes.
- Owner: `codex/cal-012-physical-route-review` in `/tmp/loo-ume-cal-012`.
  Likely conflicts: mapping controls/orchestration, renderer selection,
  hardware-frame transport, route/calibration mutation, focused browser/unit
  tests, mapping architecture, and physical-diagnostic learnings.
- Verification: 19 focused unit tests, TypeScript, two focused Chromium
  journeys covering hardware-free demo plus physical
  selection/cancel/apply/failure reconciliation, diff-check, an independent
  QUALITY review of the transactional device path, and final integrated review
  passed. Physical 41-panel use remains operator review and does not block the
  task branch.

### `P2 · FIXTURE-015` Add an image-derived KiCad diamond-panel fixture

- Scope: model the operator-supplied KiCad screenshot as one provisional
  Schema 2 panel profile and one Project Browser demo. Preserve the visible
  clipped-diamond carrier, 8 by 8 rhombic emitter lattice, and nine board
  apertures without turning image estimates into fabrication authority.
- Acceptance: the source and bundled profile load and reload; mapping contains
  64 unique emitters on one stable GPIO 16 route; all nine carrier apertures
  cut the rendered board; rectangular-only placement and fabrication remain
  disabled; every unproved connector, address, color, dimension, and electrical
  fact stays provisional; the original reference image remains in the fixture.
- Owner: `codex/fixture-015-kicad-diamond` in
  `/tmp/loo-ume-fixture-015`. Likely conflicts: panel-carrier runtime/schema,
  carrier rendering, Project Browser registry, and panel-system documentation.
- Verification: focused carrier and fixture tests, TypeScript, schema/runtime
  round trip, Project Library packaging, production build, diff-check, and a
  separate QUALITY review passed.

### `P2 · FIXTURE-016` Build the 30-panel KiCad rhombic triacontahedron

- Scope: place 30 copies of the image-derived diamond PCB on one exact rhombic
  triacontahedron. Align the shared ideal golden-rhombus edges and retain the
  PCB's clipped-corner openings at each five-way star vertex.
- Acceptance: all poses are finite right-handed face frames; every ideal shared
  edge coincides within tolerance; the 30 PCB carriers do not overlap; vertex
  openings remain visible; the saved automatic wiring route is stable; mapping
  contains 1,920 unique emitters; the Project Library package loads and reloads
  with its exact panel profile.
- Owner: `codex/fixture-016-kicad-triacontahedron` in
  `/tmp/loo-ume-fixture-016`. Likely conflicts: KiCad demo sources, project
  registries/packages, fixture tests, and panel-system documentation.
- Verification: exact polyhedron adjacency/edge tests, 23 focused fixture and
  editor tests, TypeScript, production build, diff-check, a separate geometry
  review, and a final rendered-image check without edit-hitbox quads passed.

### `P1 · INSTALL-016` Add a self-installing Mac launcher release

- Scope: publish a lightweight `LOO UME.app` that copies itself to
  `~/Applications` on first launch, installs a canonical `main` checkout below
  `~/Library/Application Support/LOO-UME/`, runs verified setup internally,
  and opens the browser editor. The `looume` launcher also provides launch,
  update, stop, and status commands for advanced use.
- Acceptance: the normal Mac path requires no Terminal command; installation
  is bounded and retryable; launches reuse one owned server; updates retain
  local projects and use the canonical-main fast-forward gate; a tagged GitHub
  workflow publishes the launcher ZIP as a separate release asset.
- Verification: 18 focused launcher/bootstrap/restart tests, shell syntax,
  TypeScript, GitHub Actions YAML lint, diff checks, and independent review
  passed. Native review remains required after the first tagged asset is built.

## In Progress

No tasks.

## Ready to Merge

### `P1 · FIRM-020` Build AudioReactive firmware with four LED outputs

- Owner: GPT-6 Astra; branch `codex/firmware-audioreactive`; worktree `/tmp/loo-ume-firmware-audioreactive`.
- Scope: build a separate AudioReactive variant from the pinned WLED source. Retain Improv and the 128-symbol RMT correction.
- Result: build `2609061` produced application and complete USB images. Both match the separate receipt under `firmware/audio-reactive`.
- Acceptance: produce application and complete USB images with an exact receipt. Keep the existing application firmware selection unchanged.
- Assumption: use an INMP441 I2S microphone. Document free microphone GPIOs separately from the four LED outputs.
- Limits: this request authorizes a build. Device flashing, physical audio tests, and main integration remain separate actions.
- Conflicts: firmware documentation and task records. Preserve the active review worktrees.
- Verification: native compilation, ESP32 image checksum, receipt assertions, JavaScript syntax, formatting, and independent compiled-path review passed.
- Delivery: `build/firmware-audioreactive-2609061` in the primary checkout preserves the package, images, receipt, compiler evidence, and build log.
- Physical review: use INMP441 SD 32, WS 26, and SCK 27. Verify sound response and all four LED outputs before claiming physical stability.
- Push: the operator approved branch publication on 2026-09-06. Commit `68e617f` was pushed to `codex/firmware-audioreactive` at `https://github.com/MateSteinforth/LOO-UME.git`. Main integration and physical tests remain pending.

## Done (2026-09-06 hardware-confirmed integration)

The operator confirmed that WLED effects and MadMapper mirroring work and
authorized integration of LIVE-030/031/032 into `main`. Build 38 is the tested
application. This is operator-reported functional evidence; the calibrated
project remains on the operator's device and has not replaced repository demos.
Earlier delivery and pending-review notes below describe the individual build
history and are superseded by this integration approval.
Integration checks: 618 tests passed and 15 failed in five unchanged geometry
test files. The same geometry failures reproduced on unchanged `main` at
`3c32370`; that baseline also had a launcher failure (608 passed, 16 failed).
Both physical-review browser journeys, TypeScript, WASM integrity, asset
generation, and the production build passed. Full `verify` is not green.

### `P1 · LIVE-031` Rotate a physical red calibration gradient

- Owner: GPT-6 Astra; branch `codex/review-gradient`; worktree `/tmp/loo-ume-review-gradient`.
- Scope: use a black-to-red diagonal with red 255 at DIN. Keep the simulator reference fixed while rotation changes physical output.
- Acceptance: preserve GPIOs and poses. Save the same address transform used for the matching physical pattern.
- Checks: gradient and mapping parity tests; physical review browser workflow; lint and TypeScript.
- Dependency: includes the separate LIVE-030 review correction.
- Verification: 20 mapping and review tests passed. Both browser journeys passed without retries, including physical rotation and fixed simulator reference checks.
- Validation: formatting, full lint, and TypeScript passed. Native sculpture review remains required.
- Delivery: the operator approved the branch push and review DMG. Keep this branch separate from `main` pending physical review.
- Mac verification: [build 36](https://github.com/MateSteinforth/LOO-UME/actions/runs/33983195845) passed packaging and application checks.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-36/LOO-UME-Electron-arm64.dmg), built from `a6725e2e45cbf93b0c64327d360dcf7e59bd0cbb`.

### `P1 · LIVE-030` Keep physical review patterns active

- Owner: GPT-6 Astra; branch `codex/wiring-review-refresh`; worktree `/tmp/loo-ume-wiring-review-refresh`.
- Scope: show the diagnostic frame in both review modes. Refresh physical output until the operator changes panels, applies the review, or closes it.
- Acceptance: keep one diagnostic panel lit without changing GPIOs. Stop obsolete frames before device mapping writes or live output resumes.
- Checks: physical review browser test, formatting, lint, and TypeScript.
- Verification: both browser journeys passed with custom GPIOs. Checks cover sustained frames, both simulator modes, cancellation, and the mapping-write boundary.
- Validation: formatting, full lint, and TypeScript passed. Physical ESP32 review remains required.
- Delivery: the operator approved the branch push and review DMG. Keep this branch separate from `main` pending physical review.
- Mac verification: [build 35](https://github.com/MateSteinforth/LOO-UME/actions/runs/33982160555) passed packaging and application checks.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-35/LOO-UME-Electron-arm64.dmg), built from `40f2b548f031457b658b3d54b182125afe4699df`.

### `P1 · LIVE-032` Verify the complete logical-to-physical output path

- Owner: GPT-6 Astra; branch `codex/output-parity`; worktree `/tmp/loo-ume-output-parity`.
- Scope: send logical DDP from every source and apply the WLED map once. Preserve authored poses, rotations, GPIOs, and measured profile facts.
- Correction: enable realtime mapping. Reconnect migrates only legacy `rlm=false` after validating the remaining device contract and verifies the write. Physical review encodes its requested physical pattern through the installed map.
- Correction: unequal red slopes distinguish all eight square orientations. The previous equal diagonal missed row/column reflection. This is a confirmed review weakness, not proof of the reported hardware cause.
- Evidence received: operator project, hardware contract, and ESP32 ledmap. The canonical project reproduces fingerprint `524500f5`, the saved route, and PC-03/PC-08/SQ-16 poses and transforms. Operator GPIOs are 16/17/21/22; old notes still list 18/19.
- Physical report: streamed WLED effects and standalone effects look identically wrong relative to the simulator. SQ-01 through SQ-05 appear 90 degrees right from the LED side; PC-03 appears 90 left, PC-08 90 right, SQ-16 180. Earlier physical review showed no defect. No compensating rotations were added.
- Verification: 58 focused tests passed, including all 41 panel blocks through the exported map and eight distinct review orientations. Both browser journeys passed without retries after assertions included gamma correction and controller mapping. TypeScript and scoped lint passed. Independent read-only review confirmed the common mapping path and symmetric-pattern weakness.
- Result: on 2026-09-06, the operator confirmed that everything works after the WLED and MadMapper checks. No further code change was needed after build 38. The exact MadMapper-side action was not reported.
- Delivery: operator authorized integration into `main` on 2026-09-06.
- Hardware test order: operator requires standalone parity first, then LOO/UME DDP, then MadMapper. Start with a direct WLED JSON four-corner test on SQ-04, without changing the map. Logical 31/32/311/312 map to physical 0/7/56/63. See `docs/LED_MAPPING.md`.
- Review build: Mac build 37 (`33985685786`) packaged and verified the application from `cd5b6d7`; its direct DMG is published under `electron-review-37`. This does not establish hardware parity.
- Quadrant review build: Mac build 38 (`33987257272`) passed packaging and DMG launch verification from `c2641b58e49e6d71c790f75d46160edd4f6c7069`. The ARM64 DMG is published under `electron-review-38` and includes four RGBW quadrants, Swap rows/columns, and standalone-first review.
- Hardware observation: direct standalone JSON test on SQ-04 produced red at upper right/DIN, green at lower right, white at lower left/DOUT, and blue at upper left. Relative to the saved pose reference, red/white match and green/blue exchange places. This establishes a diagonal reflection in the tested mapping-to-panel relationship, not a corrective rotation or a verified global PCB-profile change.
- Hardware confirmation: the four-quadrant standalone review and **Swap rows/columns** control corrected the SQ-04 reflection. Red and white remained fixed while green and blue exchanged as expected, and the result matched the simulator. Preserve this as an installed address-transform correction; do not alter the pose or global measured panel profile.
- Requested review extension: four solid RGBW quadrants and one Swap rows/columns control alongside rotations. Default to standalone JSON output, with DDP checked afterward. Terra owns `PhysicalRouteReview.ts` and its unit tests; orchestrator owns transport, UI, browser checks, and shared documentation in the same task worktree. Verify all eight saved address transforms, apply/reload parity, and unchanged poses/GPIOs/profile facts.
- Extension verification: 61 integrated mapping, review, and ESP32 tests passed. Both browser journeys passed without retries, covering standalone JSON with no DDP traffic, two row/column swaps, equivalent DDP output, cancellation failure/retry, and exact map upload/read-back. TypeScript, scoped lint, formatting, and diff checks passed. No authored sculpture, profile, pose, or GPIO changed.

### `P0 · LIVE-021` Confirm physical sculpture DDP output

- Scope: connect the complete sculpture and compare its LEDs with the simulator.
- Acceptance: the physical sculpture receives live DDP frames. Color, panel
  order, and LED address order match the simulator.
- Dependency: use the FIRM-015 ESP32 configuration now integrated in `main`.
- FIRM-019 corrected output memory allocation. The operator confirmed all four outputs on GPIOs 16, 17, 21, and 22 on 2026-09-05.
- Read-back confirms the same four configured outputs and a complete 2,624-LED segment. On 2026-09-06 the operator confirmed functional output after calibration, including WLED effects and MadMapper mirroring. This closes the operator acceptance task; no automated exhaustive pixel measurement was supplied.

## Human Review

## Blocked

No tasks.

## Retired

- `LIVE-010`: retired on 2026-09-03. Direct MadMapper-to-WLED Art-Net over
  Ethernet is no longer the selected path. `LIVE-020` uses WLAN DDP instead.
- `MECH-020`, `FAB-020`, and `FIRM-010`: removed as speculative placeholders.
  Add a new task only when an operator supplies a concrete requirement.
- `FAB-023`: deferred. The known automatic connector limit remains in F-034.
  Add a new task only when the 30-panel automatic connector path is required.
- `HW-012` and `PROOF-010`: retired by operator decision on 2026-09-03.
  CAL-012 keeps the optional panel-by-panel physical wiring review. A complete
  2,624-pixel proof is not planned.

## Earlier completed work

- `MAP-021`, `LIVE-020`, and `TD-010`: integrated on 2026-09-03 at `df3aa89`.
  Logical ordering is deterministic. Art-Net and DDP start automatically.
  Complete ZIP files include the verified TouchDesigner component.
- `UI-032`: integrated panel-by-panel physical assembly focus on 2026-08-30.
  Previous/Next panel crosses nonempty data chains, activates the selected
  panel and its incident solder cables, and mutes the remaining chain context.
  Reliably owned printable closures follow the same focus; unknown combined
  assets remain visible. Focused unit tests passed 9/9, Chromium passed 5/5,
  TypeScript and diff checks passed, and independent review found no blocker.
  Physical use on the next chain remains operator review.

- `WIRE-017`: integrated the optimized post-fabrication wiring authority on
  2026-08-30. The saved revision-4 flagship is an exact optimizer fixed point
  at 2,302.399 mm with identity installed-address transforms and mapping
  fingerprint `e9fe0e65`. The manual 0/180-degree gate preserves printed
  mounts, while new pre-fabrication projects can use all four quarter turns.
  Virtual PCBs show the six physical openings and back-only rings: DIN green,
  DOUT red, and usable mounting holes gold. Focused tests, TypeScript,
  sculpture validation, Chromium, diff-check, and independent review passed.

- `LABEL-011`: calibrated the HERMA 4385 PDF to the physically confirmed stock
  geometry on 2026-08-30: 12 mm left margin, 11 mm right margin, and fourteen
  equal 37/14 mm horizontal gaps across fifteen 10 mm labels. The PDF keeps
  printer displacement outside its document coordinates. Focused tests,
  TypeScript, A4/PDF inspection, independent review, and operator print review
  passed.

- `UI-031`: integrated the compact Project Library action area on 2026-08-29.
  The filename is the only full-width row; Save, Open/Import, and
  Download/Inspect use three desktop columns and one mobile column.

- `LIB-016`: integrated the file-browser-style Project Library on 2026-08-29.
  Thumbnails appear first and sort newest first; the filename field spans the
  save section; local and bundled entries support revision-gated rename,
  delete, and confirmed overwrite through update-safe local overlays.

- `UI-030`: integrated one complete fabrication ZIP on 2026-08-29. It contains
  the HERMA label PDF, a paginated manufacturing manual PDF, every current
  verified planar STL, and the complete current verified structural connector
  package; stale geometry stays excluded.

- `INSTALL-015`: integrated dirty-safe shell updates and a loopback-only
  in-application update notice/button on 2026-08-29. Updates are serialized,
  preserve tracked and untracked work plus local project ZIPs, and retain exact
  recovery evidence if restoration conflicts.

- `UI-029`: integrated selectable 6DOF controller pose editing, shared
  controller-pin geometry, safe optimizer-evidence invalidation, and reset to
  deterministic suggested placement on 2026-08-29.
- `INSTALL-014`: integrated one-command `./bootstrap.sh launch` and guarded
  `./bootstrap.sh update` on 2026-08-29. Launch binds reusable builds to the
  target, clean commit, runtime packages, and complete production-output hash
  manifest. Update permits only clean fast-forward changes from canonical
  `origin/main`. Focused tests, TypeScript, the production build, the Manifold
  install proof, two real launches, browser opening, and independent review
  passed.

- `FIXTURE-013`, `FIXTURE-014`, and `UI-028`: integrated the provisional wedge
  panel profile, its one-panel and 30-panel visual-study projects, reusable
  Project Library switching, manual-only viewport orbit, saved controller XYZ,
  and clear library/export labels on 2026-08-29. The 30-panel radius, poses, and
  hardware facts remain provisional; fabrication stays unavailable. The
  combined main passed all 480 unit tests, TypeScript, production build, and
  four focused Chromium Project Library/controller journeys.

- `LIVE-011` through `LIVE-013`: integrated the local MadMapper 3D preview on
  2026-08-29. The current Mapping toolbox owns Start/Stop, complete 16-universe
  loopback Art-Net frames render on the pose-derived LEDs, and the MadMapper ZIP
  includes its importable routing CSV. macOS Human Review passed at about 40
  completed frames per second; MadMapper Demo's 30-second DMX blackout remains
  an external review limit. All 473 unit tests, TypeScript, production build,
  and nine focused Chromium journeys passed after current-main integration.

- `LIB-010` through `LIB-015`: integrated the ZIP Project Library, conflict-safe
  local saves, consolidated open/backup actions, and framed viewport thumbnails
  on 2026-08-29. The integration preserves the current Fabrication UI and
  flexible-ring format; all 14 authored demos have a ZIP and PNG thumbnail, and
  the ring ZIP includes its project-local panel profile. All 462 unit tests,
  TypeScript, production build, and eight focused Chromium journeys passed.

- `UI-027`: integrated one Fabrication toolbox for part generation, the unified
  label-and-current-connectors ZIP, the data-chain assembly tutorial, and ESP32
  testing on 2026-08-29. Focused ZIP/PDF tests, TypeScript, production build,
  Chromium, stale-artifact regression, operator LAN review, and independent
  review passed.

- `FIXTURE-012`: integrated the 1,000 mm diameter flexible LED-ring demo with
  188 outward-radial emitters and one GPIO 16 output on 2026-08-29. Mapping,
  wiring, WLED setup, portable export/reload, focused tests, TypeScript,
  Chromium, and independent geometry review passed. Rectangular-only placement
  and fabrication remain disabled for this carrier.
- `FIXTURE-010` / `FIXTURE-011` / `UI-026`: integrated explicit pose-local
  emitter and DIN/DOUT coordinates, arbitrary planar and flexible-path carrier
  display geometry, profile-driven capability gates, and the unnumbered toolbox
  sidebar on 2026-08-29. The legacy 41-panel project remains byte-equivalent;
  focused fixture, mapping, WLED, boundary, UI, TypeScript, build, and
  independent reviews passed.

- `LABEL-010`: integrated the HERMA 4385 multi-page panel-label PDF and DIN-end
  simulator label placement on 2026-08-29. The operator confirmed the browser
  export. Focused tests, TypeScript, production build, PDF 1.7/A4 inspection,
  and independent review passed.

- `MAD-010` / `MAD-011`: integrated the mapping-ready MadMapper ZIP download
  on 2026-08-28. It exports 2,624 pose-positioned physical RGB fixtures in 41
  panel groups, direct addresses over 16 universes, CSV/JSON information, and
  a setup PDF. Eight focused tests, TypeScript, and the production build passed.
  MAD-014 later corrected the fixture geometry. LIVE-020 owns live WLAN output.
- `WIRE-016`: integrated automatic balanced data routing, GPIO 16–19
  assignment, pose-owned DIN/DOUT orientation, the durable pre/post-fabrication
  rotation gate, and the Advanced manual route editor on 2026-08-28. Focused
  optimizer/mapping/tutorial tests, TypeScript, Chromium, diff checks, physical
  LAN UI review, and independent review passed.
- `UI-025`: integrated panel-selection auto-rotation stop and synchronized View
  state on 2026-08-27. Reconciled current operator, architecture, hardware,
  firmware, mapping, workflow, CI, and failure-learning documentation;
  TypeScript, diff checks, stale-contract scan, and independent review passed.
- `UI-024`: integrated the always-editable six-step fabrication workflow,
  persistent View animation controls, Build Hardware assembly/ESP32 controls,
  compact action layout, and revised renderer lighting on 2026-08-27.
- `UI-023`: integrated the compact View control layout and standard framebuffer
  selector through UI-024 on 2026-08-27.
- `CI-012`: integrated nightly broad Vitest, Chromium, Manifold, bootstrap, and
  clean-host verification while keeping push/PR automation to the fast build
  gate on 2026-08-27.

- `UI-022`: integrated the full-height aspect-safe viewport, compact View
  controls, Plane/World transform toggle, plain tutorial panel IDs, button-only
  chain navigation, two-column placement controls, and atomic LAN staging on
  2026-08-27. Focused unit checks, TypeScript, diff checks, and independent
  review passed; the broad browser suite was not rerun by operator request.
- `CI-011`: normal pushes and pull requests now run only the locked install,
  checked-in WLED runtime verification, TypeScript, and production build. The
  full browser, Vitest, Manifold, bootstrap, and host matrix remains available
  through **Run workflow**; integrated on 2026-08-27.
- `UI-021`: DIN/DOUT and panel-wiring switches now control their scene layers
  during chain isolation, survive navigation, and remain selected after exit.
  The stable LAN preview command and P1 MadMapper bridge task are included;
  integrated on 2026-08-27.
- `UI-020`: integrated the interactive chain-by-chain wiring tutorial, compact
  two-column controls, red current-wire focus, muted selected-chain context,
  populated 41-panel default, improved LED depth separation, gradient backdrop,
  and three-point scene lighting. Focused tests, TypeScript, diff checks, and
  independent reviews passed; integrated on 2026-08-27.
- `FIRM-015`: pose-only panel edits now update and activate the exact spatial
  WLED ledmap before preset persistence and DDP resume. Route, calibration,
  output, color-order, malformed-map, and identity changes remain fail-closed.
  The operator accepted the physical result and requested integration on
  2026-08-27; 387 tests, TypeScript, Vite, and independent review passed.
- `FIRM-014`: copied loaded 1–41-panel simulator playback to WLED with exact
  config, ledmap, preset, and boot-state read-back; gamma-corrected DDP live
  mirroring; bounded reconnect; and persistent native fallback. On 2026-08-26,
  the operator confirmed connection, effect changes, tab-close fallback, page
  reload reconnect, and power-cycle restoration on the 192-LED three-panel
  sculpture.
- `PWR-010`: removed from repository scope by operator decision. External
  electrical design and protection are operator responsibilities; generated
  WLED current values are operating assumptions, not an electrical approval.
- `FIRM-013`: stabilized physical CP2102 flashing, serial Improv setup,
  private-device read-back and reconnect, and the physically mapped live 8x8
  simulator link. The operator completed setup at `192.168.68.53`; 366/366
  tests, TypeScript, Vite, focused browser journeys, and review passed.
- `FIRM-012`: integrated the receipt-verified BUILD HARDWARE ESP32 flash,
  private Wi-Fi provisioning, `loo-ume.local` identity, one-panel simulator
  state transfer, and device read-back; physical browser/USB review passed on
  2026-08-25. Full-install mode remains unavailable.
- `FIRM-011`: the pinned WLED binary flashed successfully to the ESP-WROOM-32;
  the operator confirmed the 64-pixel GPIO16 smoke configuration, GRB colors,
  straight 0–63 row-major address walk, reboot persistence, and stable operation.
- `CAL-011`: measured GRB/order-0 and front-view straight row-major addressing
  were integrated in `main` at `80a1225`. WIRE-017 preserves those facts while
  replacing that historical route fingerprint with the current optimized
  mounting-aligned mapping fingerprint `e9fe0e65`.
- `DIAG-010`, `ARCH-010`, `CAD-020`, `PLACE-010`, `FAB-022`, `SEC-010`, and
  `MAP-020`: the reviewed unblocked implementation batch is integrated in
  `main` at `d51e8bb`; integrated Vitest passed 348/348 with TypeScript and Vite.
- `HR-006`: operator printed representative Manifold parts and confirmed on
  2026-08-25 that they work.
- `FAB-021`: corrected structural PCB back-view coordinates and added
  fail-closed DIN/DOUT keep-outs for ribbons, LED-surface bridges, and merged
  junctions in `main` at `4961f4d`; unsafe automatic paths now stop instead of
  exporting overlapping parts.
- `DOC-010`: integrated the ten-page connector design-process HTML/PDF and five
  current UI images in `main` at `4c8c82c`; its task worktree and branches were
  removed after the verified push.
- `TRUSS-011`: integrated connector ribbons, LED-surface bridges, four JSON
  presets, switchable surface/free-6DOF editing, Advanced Tools settings, and
  exact displayed-connector ZIP export in `main` at `641cf6b`; its source and
  integration worktrees and branches were removed after documentation and
  integration completed.
- `INSTALL-012`: the restricted-PATH one-command setup passed on Linux x86-64
  and native macOS arm64/x86-64 in integration run `32656402016`; no global
  Node/npm installation or administrator command is required.
- `INSTALL-011`: added one-command pinned repository-local Node/npm setup,
  locked dependency installation, desktop build, and Manifold production proof.
- `VALID-011`: centralized deep Schema 2 validation for browser and CLI input,
  including mapping, calibration, boundary, asset, and note contracts.
- `VALID-010`: made LED grid dimensions profile-driven through mapping,
  validation, export, reload, rendering, and rectangular-turn safeguards.
- `LEGACY-011`: retired the Schema 1 schema, migration fixture/script,
  procedural mapping path, and legacy-only tests; the 41-panel Schema 2 project
  and deployment artifacts remain byte-identical.
- `BUILD-010`: normal development and CI now verify the checked-in WLED
  simulator without Python, Emscripten, or a WLED checkout. Reproducible source
  generation remains on `generate/wled-simulator` at `64b743a`.
- `WIRE-012`: integrated the shared guarded browser/CLI deployment policy in
  `main` at `d900cdb`; mapping-ready input gets exact WLED installation files,
  while draft or stale input gets only explicit diagnostic artifacts.
- `CTRL-008`: recorded the operator-approved visual, panel-profile, WLED
  generation, Schema 2, stale-mechanics, and boundary-format decisions in
  `main` at `ee8f79f`; physical Manifold print review remains open as `HR-006`.
- `UI-011`: operator approved the opaque glossy black PCB appearance.
- `CAL-010`: operator approved the existing panel profile for the current
  41-panel build. Existing measured values stay measured; provisional or
  unknown electrical, pad, and address facts are not relabelled as measurements.
- `HR-013`: normal `main` will use the checked-in WLED simulator and will not
  require Python or Emscripten; reproducible generation moves to a dedicated
  branch under `BUILD-010`.
- `HR-005`: confirmed the 41-panel authority is Schema 2; `LEGACY-011` retired
  the remaining Schema 1 migration dependencies.
- `HR-008`: stale generated parts stay hidden until regeneration; no stale-part
  inspection toggle is required.
- `HR-009`: keep JSON poses/topology and STL output; do not add another boundary
  asset format without a concrete future need.
- `UI-019`: removed the performance overlay and individual-file export menu,
  moved secondary display and GLB controls into Advanced Tools, and unified
  operator messages in one activity log in `main` at `6615c54`.
- `CTRL-007`: removed the retired printable toolchain and its generated
  artifacts, made Manifold the only printable-parts kernel, and established
  FAST/STANDARD/QUALITY execution and Luna/Terra/Sol routing in `main` at
  `33d6455`.
- `UI-012`–`UI-018`: integrated browser-first Manifold status, generation,
  package/manual downloads, bounded JSON fallback, simplified controls, and
  unified project/route/package workflow in `main` at `e278333`.
- `CAD-030`–`CAD-037`: pinned Manifold solids, browser/local compilation,
  exact assets, pose-only caps, labels, planar tolerances, and CI proof.
- `WIRE-010`–`WIRE-015`, `MAP-021`, `MAP-022`, `MAP-030`, `HW-016`, `HW-017`:
  authored routes, lifecycle, route editor, assembly manual, installed address
  transforms, GPIO/bus contract, and corrected mapping assumptions.
- `CORE-001`, `ASSET-001`, `BOUNDARY-001`, `PARTS-001`, `PORTABLE-001`,
  `TEST-010`, `TEST-011`: pose-first editor, portable assets, validated
  boundary, exact parts, folder/ZIP support, and real browser journeys.
- `CTRL-001`–`CTRL-005`: persistent task board, safe workflow, failure learning,
  architecture reconstruction, and simulator-to-hardware priority.
