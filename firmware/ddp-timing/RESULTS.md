# FIRM-044 device results, 2026-11-16

Controller MAC `2462abc9f3a8`, four RMT outputs, AudioReactive on, brightness 128.
Wi-Fi: RSSI -79 to -81 dBm, 2.4 GHz channel 10. The operator could not improve the link for this test.
Private evidence: `build/device/` in the primary checkout (not in Git).

## Rebuild

The build tree under `/tmp` was lost (F-195). The tree was made again in `build/fw/` from the receipts.
Tool versions and all 22 source hashes of the 2609099 receipt match.
The rebuilt images have the receipt sizes (1,154,928 and 1,157,792 bytes).
Their SHA-256 values differ from the receipts, because the image contains the compile time:

- 2609099 rebuilt: `c320498b79ba607e00066c408d19255fb8b851c6dffb1b68af516540e64e4af7`
- 2609103 rebuilt: `3711752fc35135707b610cbc6da2fe511391038c18d81431f1cc1a2bf1e44e84`

2609103 was installed by OTA at 18:46 UTC. Read-back: `vid` 2609103, GPIOs 16, 17, 21, 22, overlap off.

## Sender finding

LOO/UME 0.1.50 (built from `main`) sends 10 frames/s: `web/src/main.ts` sets `nextSimulatorFrameAt = now + 100`.
The controller received 9.4 complete frames/s from it and showed all of them.
The 30 frames/s sender of review 44 is on the unmerged branch `codex/ddp-rate-control`.

## Measurements

Source for all rows: a wired Linux host sent a dim moving pattern at 30.0 frames/s (6 packets per frame).

| Firmware and mode       | Complete/s | Shown/s | Shown  | Main cause of replaced frames   |
| ----------------------- | ---------: | ------: | -----: | ------------------------------- |
| 2609099                 |      30.14 |   25.09 |  83.2% | Not measured by this build      |
| 2609103, overlap off    |      29.74 |   26.35 |  88.6% | Wait for previous transmission  |
| 2609103, overlap on     |      30.17 |   27.61 |  91.5% | Frames arrive during paint/show |

- No packet was lost: invalid and incomplete counts were zero in each window.
- Paint takes 1.4 to 2.3 ms on average. Show takes 7 ms without the driver wait. These are not the limit.
- Arrival is bunched. One frame needs 16 to 18 ms on average from its first to its last packet
  (p90 50 ms, p99 100 ms). About 30% of the frames arrive less than 20 ms after the previous frame,
  and about 17% arrive more than 50 ms after it. The largest gap was 360 ms.
- With overlap, no frame waits for the wire. The remaining replaced frames arrive faster than one wire
  time (21.3 ms). The gaps above 50 ms give long output intervals that no receiver change removes
  without added delay.

Ping from the wired host (1,400 bytes): 23 ms average and 160 ms maximum with the LEDs off,
26 ms and 168 ms with the LEDs on. LED output load is thus not the cause of the network delay.
During the 10 frames/s stream at the start of the session: 291 ms average, 9% loss.

## Conclusion

1. The serialized presenter lost frames. Overlap removes that loss.
2. The remaining loss and the uneven cadence come from Wi-Fi delivery jitter on this link.
3. A fixed-cadence playout buffer (some frames of delay) or a better link is necessary for an even 30 frames/s.

The operator has not yet given a visual result for these windows.
