# Project task board

Last reconciled: 2026-11-15. Integration baseline: `main`.

This board contains open work only. The control rules are in `AGENTS.md`.
The full text of each task below, all completed tasks, and the firmware
handoff of 2026-09-09 are in
[`docs/archive/TASKS-through-2026-09.md`](docs/archive/TASKS-through-2026-09.md).
Search the archive by task ID before you start an archived task:

```bash
rg -n -A12 'FIRM-042' docs/archive/TASKS-through-2026-09.md
```

When a task is integrated, move its entry to the archive. Keep one line in
**Done since the last archive** until the next archive.

## Current state

- **Firmware baseline (operator confirmed 2026-09-09, integrated in
  `2cafd49`):** build 2609099, four RMT outputs on GPIOs 16, 17, 21, 22, DMA
  off, microphone processing on, brightness 128. Source and receipt:
  `firmware/ddp-expiry/`. SHA-256 of the image:
  `007c3e6c584a86d7b9bfc1522a9413d0a9867677b27f2ba07d81f4680d42cac4`.
- **Open firmware goal:** residual flashes remain. The measured rate was 25.63
  presented frames/s; the target is 30. The output is not accepted as
  flicker-free.
- **Do not repeat without new evidence:** DMA output trials (2609096,
  2609097, and 2609099 with DMA each failed physically), audio shutdown builds
  2609082/091/092, a higher RMT priority, a shorter GPIO16 chain, and a 300 µs
  reset.
- **Installed now:** timing candidate 2609103 (2609099 plus histograms and a
  runtime overlap switch that is off at boot). Rebuilt images and the
  toolchain are in `build/fw/` of the primary checkout.
- **Application:** no feature task is in progress.

## In Progress

No tasks.

## Ready to Merge

### `P2 · DOC-011` Make the agent documents host-neutral and short

- Owner: Claude Code; branch `fable` in the primary checkout (operator
  instruction).
- Scope: archive the task board and the failure log, rewrite `AGENTS.md`
  without host-specific rules, add `docs/AGENT_NOTES.md`, prune stale
  worktree records.
- Acceptance: no project invariant is lost; startup reading is much smaller;
  `npm run format:check` passes for the changed files.

## Human Review

- `FIRM-038` Distinguish the GPIO22 output from its downstream chain. The
  operator reports that chain swaps were already tested and considers the
  hardware sound. Do not ask for the swap again. The operator decides whether
  to retire this task or to do the signal capture.
- **Branches.** 21 local branches are not merged into `main`. All have a
  remote copy since 2026-11-15. The operator decides which branches to merge
  or delete.

## Backlog

Firmware (P1; physical steps need the operator):

- `FIRM-044` Measure DDP presentation timing and test RMT overlap. In
  Progress on `fable` (operator instruction). 2609103 is installed since
  2026-11-16. Results: `firmware/ddp-timing/RESULTS.md`. Overlap raises shown
  frames from 88.6% to 91.5%; the remaining loss is Wi-Fi arrival jitter
  (RSSI -80 dBm). Next: operator decision between a playout buffer and a
  better link. The build tree is now in `build/fw/` of the primary checkout.
- `FIRM-045` Correlate the residual flashes with frame data and RMT timing
  before another output-driver change. Check native-to-DDP transitions
  separately from steady playback.
- `FIRM-037` Explicit driver contract in the application. Complete offline at
  `25977c4` on the unmerged branch `codex/ddp-driver-contract`.
- `FIRM-041` Validate standalone audio on the selected output backend.
- `FIRM-042` Validate DDP/audio transitions and overload recovery.
- `FIRM-043` Sustained acceptance, recovery, and final handoff.
- `FIRM-039` Compare RMT and DMA on repeated Solid. Blocked by the failed DMA
  trials; start again only on operator instruction.
- `FIRM-018` Recover USB Improv setup without an application restart.
  Deferred by the operator. See F-166.
- `FIRM-016` Set up official WLED firmware for all supported ESP32 targets.
  QUALITY mode.

Application (P2; deferred by the operator):

- `REVIEW-020` Correct structural generation for saved examples. 15 geometry
  tests fail.
- `REVIEW-021` Protect unsaved project changes.
- `REVIEW-022` Reject obsolete asynchronous project results.
- `REVIEW-023` Align firmware support across launch commands.

Development (P2):

- `DEV-021` Extend stricter Node and boundary lint checks.
- `DEV-022` Gate affected geometry and browser changes before merge. Depends
  on REVIEW-020.
- `DEV-023` Measure remaining test and asset preparation costs.
- `DEV-026` Remove the `darwin-x64` bootstrap target. Operator decision
  2026-11-15: Intel Mac is not supported. Affects `bootstrap.sh`,
  `toolchains/bootstrap/` (binary, install manifest, build receipt),
  `scripts/*bootstrap*`, `scripts/desktop-build-receipt.mjs`, and
  `tests/bootstrap-install.test.ts`. Keep the receipts synchronized.
- `DEV-027` Divide `web/src/main.ts`. `start()` is one function of
  approximately 4,000 lines. Extract one seam for each task: external preview
  arbitration, simulator hardware link, ESP32 setup panel. QUALITY mode.
- `DOC-012` Reconcile `firmware/AGENTS.md` with the accepted baseline. It
  names GPIOs 16 to 19 and disabled audio; the baseline uses 16, 17, 21, 22
  with audio. The operator must confirm the target definition.

## Blocked

No tasks.

## Done since the last archive

None on `main`. On `fable`:

- `LIVE-033` Merged `codex/playback-source-fix` (review 50: computer
  microphone input, Equator Wave, explicit audio save, playback fixes) and
  changed the built-in effect sender from 10 to 30 frames/s with deadline
  pacing. A merge of `codex/ddp-rate-control` (review 44) was made first and
  reverted, because review 50 is the application that the operator uses and
  the two lines conflict. `main` still sends 10 frames/s.
