# FIRM-033: isolated RMT reset diagnostic

Diagnostic 2609093 follows the original non-audio 2609051 build recipe. The
selected WS2812x reset is now 300 microseconds instead of the Core 3 driver's
hard-coded 50 microseconds. The only other source change is the build ID.

The operator's repeated Solid comparison showed fewer but remaining flashes on
2609051, predominantly whole-GPIO16 black/blue frames. Audio is not required
for every flash. GPIO16 is the first and longest output and can have less idle
time between transmissions. This makes a longer reset a falsifiable test of
the shared output path, not an established fix. A longer reset cannot establish
complete DDP frame ownership or smooth motion.

## Preserved controls

- WLED `d9b9a846561227351ad929e3109781daadb7bed2` and NeoPixelBus
  `76afe832f74b0738a3fa1bba0caf389ade9e7693`.
- Original non-audio PlatformIO override, framework and toolchain versions.
- Original DDP receiver, 128 RMT symbols per output, default IRQ priority,
  flash-resident refill wrapper, and transmit-buffer handling.
- Four configured WS2812 RGB outputs, original lengths, mapping, brightness,
  native timer 42, and the same LOOUME Solid stream.
- Both original images: non-audio 2609051 and audio fallback 2609085 remain intact.

The template uses each selected speed's reset duration. Other RMT LED protocols
would receive their own declared reset if configured. This test retains only
the configured WS2812x buses; their data bit timings are unchanged.

## Verification and reproduction

Prepare a separate source tree from the pinned archive and the installed
toolchain described in [RMT4_REBUILD.md](../RMT4_REBUILD.md). Retain the original
non-audio `firmware/wled-platformio.ini` as `platformio_override.ini`. Apply the
existing `firmware/patch-rmt.mjs` to the pristine pinned NeoPixelBus header,
then run the diagnostic patch instead of the original build-ID patch:

```bash
node firmware/reset-gap/patch.mjs build/firmware-source \
  build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
```

With the pinned PlatformIO environment configured, generate `compiledb` before
the final build, using a private fresh build cache. Then run:

```bash
python3 firmware/reset-gap/verify.py
```

The verifier checks source hashes, original flags and tool versions, absence
of compiled audio, the compiled reset and bit timing literals, and callback
placement. It writes the application image and receipt under
`build/firmware-reset-gap/`. Use the application image through WLED's validated
OTA; it is not a full-flash image.

The compiled initializer at `0x400e1e30` contains reset word `0x17701770`:
two 6,000-tick low fields at 40 MHz, totaling 300 microseconds. The original
zero/one timing words remain `0x00228010` and `0x00128020`. The independent
review confirmed clock units, field capacity, unchanged data pulses and scope.
The source guard checks rejected upstream, already-patched and altered input.

Build and verification passed. Diagnostic2609093 was installed through validated
OTA on2026-09-09. Device identity/build were verified, the complete configuration
matched2609051 except its build ID, and mapping/brightness were unchanged.
DDP resumed. A bounded pixel-preview capture again contained40frames of874
sampled pixels, all `ff3201`; this is software-buffer evidence, not a physical
output measurement. Private device evidence is under
`build/device-test-20260909-075621`. The operator first reported flashes still
present, perhaps slightly reduced; later reported nearly gone, with residual
flashes visible on GPIO22/PC02. At uptime484s, read-back confirmed2609093 and
unchanged full configuration/map, brightness128 and DDP active. This preserves
both observations rather than treating either as a stable measured error rate.
With controller polling/previews idle, the operator estimated a flash every
1–2seconds and clarified bothGPIO16 andGPIO22, predominantlyGPIO22/PC02. This
is an approximate operator rate, not a timed automated count. The residual
rate remains unacceptable. See [the measurement plan](MEASUREMENT_PLAN.md)
for the next diagnostic design; no instrumentation has been built or installed.

The reset change alone is not an accepted zero-flash fix. The qualitative
reduction does not prove the physical mechanism, and Solid cannot establish
frame-drop improvement. Controller remains on2609093 for investigation; no
additional change is installed. The build receipt's
status describes its creation before installation; this paragraph records the
subsequent device test.

## Returning to audio

The prior same-binary test used microphone type 255 and disabled AudioReactive.
When reinstalling 2609085, restore the saved original microphone settings and
reboot before evaluating native/audio effects. The exact private restore is
`/tmp/loo-ume-audio-cold-off-20260909-073913/restore.json`.
