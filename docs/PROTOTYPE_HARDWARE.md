# Assumed prototype hardware contract

This is the build baseline selected on 2026-08-20. It is deliberately
conservative. All values in this document are selected assumptions unless the
text explicitly calls them measured. A walking-pixel, color, current, or
device read-back test can replace them.

## Controller

| Item | Selected value |
| --- | --- |
| Board | Espressif ESP32-DevKitC V4 |
| Module | ESP32-WROOM-32E-N4, 4 MB flash, no PSRAM |
| WLED source | `d9b9a846561227351ad929e3109781daadb7bed2` |
| WLED environment | `esp32dev` |
| Scope | Local WLED web UI and JSON configuration only |
| Output 0 | GPIO 16 |
| Output 1 | GPIO 17 |
| Output 2 | GPIO 18 |
| Output 3 | GPIO 19 |
| Level shifter | SN74AHCT125, powered from 5 V |
| LED type | WLED WS281x RGB, type 22 |
| Color order | GRB, WLED order 0 — **assumed** |
| Bus reversal | `false` on all four outputs |
| Driver | RMT, WLED driver 0 |

Use the WROOM module. Do not substitute a WROVER module because it reserves
GPIOs 16 and 17. Put one 100 nF ceramic bypass capacitor at the SN74AHCT125.
Tie each active-low output-enable pin to ground. Tie unused inputs to ground.
Put one 33 ohm series resistor between each shifter output and its outgoing
data cable. The controller, shifter, panels, and both supplies share ground.

During normal external-power operation, feed the DevKitC 5 V pin from domain A
through a 1 A fuse. Do not connect USB power at the same time. Espressif permits
only one DevKitC power input at a time.

## Four WLED buses

| Output | GPIO | Panels | Start | Length | Domain | Maximum current |
| ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 0 | 16 | 11 | 0 | 704 | A | 14,000 mA |
| 1 | 17 | 10 | 704 | 640 | A | 14,000 mA |
| 2 | 18 | 10 | 1,344 | 640 | B | 14,000 mA |
| 3 | 19 | 10 | 1,984 | 640 | B | 14,000 mA |

Set the global `hw.led.maxpwr` value to `0` so the pinned WLED build uses its
per-bus limits. Each bus uses `type: 22`, `order: 0`, `rev: false`,
`ledma: 60`, `maxpwr: 14000`, and `drv: 0`. The four per-bus limits give a
56 A aggregate software ceiling and a 28 A ceiling for each two-output domain.
The fuse and wire plan is still the primary protection. A nonzero global
`hw.led.maxpwr` would replace the per-bus limiting behavior and is invalid for
this contract.

`wled/cfg.provisional.json` is the exact non-secret WLED configuration fragment
for these four buses. `wled/deployment-manifest.provisional.json` records the
exact-byte SHA-256 and byte length of that file and the review ledmap. The
SHA-256 of the exact manifest bytes is the review deployment identity printed
by `npm run generate:mapping`. The manifest does not hash itself. These files
remain review-only until device read-back, panel calibration, and power tests
pass.

## Panel address convention

Until a test corrects it, use this back-view convention:

- DIN and pixel 0 are at bottom-left.
- The first row runs left-to-right.
- Rows progress upward and alternate direction.
- Pixel 56 is at top-right.
- Pixel 63 is at top-left.
- DOUT is at top-right.
- The installed address transform is zero quarter-turns and not mirrored.

Install each PCB so this marked back-view frame agrees with the simulator
panel-local frame. If a frame or connector prevents that orientation, change
the saved address transform before connecting that panel's data cable.

## Power distribution

- Use two regulated 5 V / 40 A supplies.
- Keep the two positive rails separate.
- Join negative rails at one star-ground point near the controller.
- Domain A feeds outputs 0 and 1. Domain B feeds outputs 2 and 3.
- Use a 15 A fuse at the supply end of each output's 12 AWG distribution trunk.
- Feed every panel with its own 18 AWG V+/V- pair from its domain distributor.
- Put a 5 A fuse in each panel positive branch, close to the distributor.
- Connect panel-to-panel cables for data and reference ground. Do not use panel
  V+ pads to carry accumulated chain current.
- Inject power at every panel. Use the nearest accessible V+ and V- pads.
- Keep loaded panel voltage at or above 4.75 V.
- Do not operate unrestricted full white. Keep all four 14 A bus limits active.

The conservative unrestricted estimate is 157.44 A. This prototype contract
limits it to 56 A because the two 40 A supplies are used at no more than 28 A
per domain during normal operation.

## Correction triggers

Stop the affected output and update the project if any of these occur:

- the walking pixel does not follow the assumed 0–63 sequence;
- red, green, or blue selects the wrong channel;
- an installed PCB needs a different quarter-turn or mirroring;
- a supply or connector becomes hot;
- a fuse opens;
- a panel falls below 4.75 V;
- WLED read-back disagrees with global `hw.led.maxpwr: 0`, a GPIO, start,
  length, order, reversal, driver, per-bus limit, source revision, or ledmap
  identity.

Correct only the affected fact, regenerate dependent files, and continue from
the last verified output.

## External references

- Espressif DevKitC V4 pin and power documentation:
  <https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html>
- WLED compatible hardware and level shifters:
  <https://kno.wled.ge/basics/compatible-hardware/>
- WLED wiring and fuse guidance:
  <https://kno.wled.ge/advanced/wiring/>
- WLED multiple-output guidance:
  <https://github.com/wled/WLED/wiki/Multi-strip>
