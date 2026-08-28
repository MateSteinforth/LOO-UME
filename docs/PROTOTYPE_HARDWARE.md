# Assumed prototype hardware contract

This is the build baseline selected on 2026-08-20. It is deliberately
conservative. All mapping values in this document are selected assumptions.
They can be corrected directly in the project as assembly continues.

## Controller

| Item | Selected value |
| --- | --- |
| Board | Espressif ESP32-DevKitC V4 |
| Module | ESP32-WROOM-32E-N4, 4 MB flash, no PSRAM |
| WLED source | `d9b9a846561227351ad929e3109781daadb7bed2` |
| WLED environment | `esp32dev` |
| Scope | Native WLED playback, browser setup/read-back, and bounded DDP preview |
| Output 0 | GPIO 16 |
| Output 1 | GPIO 17 |
| Output 2 | GPIO 18 |
| Output 3 | GPIO 19 |
| Level shifter | SN74AHCT125, powered from 5 V |
| LED type | WLED WS281x RGB, type 22 |
| Color order | GRB, WLED order 0 — **measured on one panel** |
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
this contract. Current limiting is electrical protection, not a mapping input.

`npm run generate:mapping` writes only explicit files below `wled/diagnostic/`.
`npm run generate:mapping:hardware` writes the guarded installation files
`wled/cfg.json`, `wled/ledmap.json`, `wled/route-mapping-manifest.json`, and
`wled/deployment-manifest.json`. The manifest binds the exact source project,
configuration, ledmap, route/mapping data, target build, file sizes, and
SHA-256 values. The SHA-256 of the exact manifest bytes is the deployment
identity printed by the command. The manifest does not hash itself. Electrical
approval is separate and does not change addresses, color order, or
orientation.

## Panel address convention

The one-panel test on 2026-08-25 measured this convention:

- Front view: DIN and pixel 0 are at top-left.
- Front view: every row runs left-to-right without serpentine reversal.
- Front view: rows progress downward; pixel 56 is bottom-left and pixel 63/DOUT
  is bottom-right.
- Back view: DIN/pixel 0 is top-right, each row runs right-to-left, and
  DOUT/pixel 63 is bottom-left.
- The automatic route writes each selected physical quarter turn into the panel
  pose before fabrication. After a generated-part manifest exists it permits
  only the current pose or a 180-degree turn. Mirroring remains false.

The older address-only orientation study reduced its inter-panel estimate from
2,795.8 mm for identity orientation to 1,245.8 mm. That result is historical
comparison data. The current automatic route also includes each controller pin
to the first DIN and writes every selected physical turn into the panel pose.
Both estimates use named connector corners because exact pad centres are not in
the profile.

Install each PCB with the saved pose orientation. If a frame or connector
prevents it, change the panel pose and optimize the route again before
connecting its data cable.

## Power distribution

The following values are operator-supplied external installation assumptions.
The repository records them for WLED configuration; it does not own or approve
the electrical plan.

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
- Do not operate unrestricted full white. Keep all four 14 A bus limits active.

The conservative unrestricted estimate is 157.44 A. This prototype contract
limits it to 56 A because the two 40 A supplies are used at no more than 28 A
per domain during normal operation.

## Correction triggers

Stop the affected output and update the project if any of these occur:

- the walking pixel does not follow the assumed 0–63 sequence;
- RGB selects the wrong channel order;
- an installed PCB needs a different quarter-turn or mirroring;
- a fuse opens;

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
