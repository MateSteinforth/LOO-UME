# FIRM-044 handoff for a cloud session

Date: 2026-10-04. Branch: `claude/ddp-present-overlap`. Commit before this file: `63b9d5d`.
Read `AGENTS.md`, `firmware/AGENTS.md`, `FAILURES.md` (F-197, F-198), and `firmware/ddp-timing/README.md` first.

## Request and finding

The operator asked for a DDP double buffer to stop choppy DDP playback with AudioReactive compiled.
Firmware 2609099, which is installed, already has this buffer (FIRM-040): three hidden frame buffers,
publication at the final PUSH packet, and newest-frame replacement. Do not add a second DDP buffer.

The remaining loss: on RMT, 2609099 received 29.21 complete frames/s and showed 25.63 frames/s.
The probable cause: `looDdpService()` paints only after `BusManager::canAllShow()`. The wire time
(21.17 ms for 704 pixels), paint and show time (usually below 9 ms), and loop delay then fill most of
the 33.3 ms frame period. The RMT driver has two buffers, so this wait is not necessary on RMT.
The DMA driver has one buffer and must keep the wait.

## State of the work

- Candidate 2609103 (`firmware/ddp-timing/`) patches the exact 2609099 source.
- It adds `/json/info.loo_ddp.timing` histograms and replacement causes.
- It adds a runtime switch `/json/state {"loo_ddp":{"overlap":true}}`. The switch is off at every boot,
  and it is never active when DMA is requested.
- `report.py` summarizes saved `/json/info` files. It does not contact a device.
- Host evidence: all FIRM-040 scenarios pass unchanged. For bunched 30 frames/s input, serialized output
  shows 20 of 30 frames and overlap shows 30 of 30. This is a simulation, not an ESP32 measurement.
- Build evidence: `build-receipt.json`. Image SHA-256
  `11d343008729894408ee6009a66e33a6595b8d9cc84aeab75afa3ea6b67c5b0c`, 1,157,792 bytes.
- TASKS.md status: FIRM-044 Ready to Merge (offline only). Nothing was installed. Not merged into `main`.

## What a cloud session can and cannot do

The image, the pinned 2.6 GB toolchain, and the exact 2609099 source exist only on the operator's Linux host:
`/tmp/loo-ume-ddp-present-overlap/build/` and the preserved archive `/tmp/loo-ume-ddp-audio-unified/build/`.
They are not in Git. The controller is on the operator's LAN and is not reachable from the cloud.

A cloud session can:

- review `firmware/ddp-timing/loo_ddp.cpp`, `DdpFrames.h`, `patch.py`, `verify.py`, and the harness;
- run `python3 firmware/ddp-timing/report.py --self-test`;
- compile `firmware/ddp-expiry/test-expiry.cpp` with `-I firmware/ddp-timing`;
- copy `firmware/ddp-dma/test-queue.cpp` next to `firmware/ddp-timing/DdpFrames.h` and run it with ASan/UBSan;
- update documentation and the task board.

A cloud session cannot run `test-service.py`, `verify.py`, or the firmware build without the 2609099 source tree.
It must not claim device results, and it must not try to reach the controller.

## Next step (operator present, local host)

Follow "Attended comparison" in `README.md`: install 2609103 by OTA only with operator approval;
compare overlap off and on with the same moving 30 frames/s stream in 60 s windows; save `/json/info`
after each window; run `report.py A.json B.json`; record flashes per output; check timeout, audio effect,
ledmap, and that overlap is off after a power cycle. Then use the decision table in `README.md`.

Rollback image: 2609099, SHA-256 `007c3e6c584a86d7b9bfc1522a9413d0a9867677b27f2ba07d81f4680d42cac4`.

## Open questions for the operator

- Approval and a time for the attended OTA comparison.
- Whether to push this branch and whether to merge it into `main` (both need explicit approval).
