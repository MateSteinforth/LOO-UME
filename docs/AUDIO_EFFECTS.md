# Audio effect development

The simulator accepts a computer microphone or a generated demo beat.
Select an effect under **Audio reactive · Computer microphone**.
Then select an **Audio input** in the View controls.
If the browser requests microphone permission, permit access to the selected input.
Select **Off** to release microphone capture. Closing the page also releases capture.
Use the desktop application or a secure browser origin, such as HTTPS or localhost.
An ordinary LAN HTTP address does not provide browser microphone access.

Equator Wave draws a narrow line around the sculpture's equator.
Bass changes its vertical wave amplitude and brightness.
High frequencies add random white points with short fades.
Speed controls wave motion. Intensity controls input sensitivity.
The effect uses the primary color. It does not use the palette selector.
The other 30 simulator effects retain their existing behavior and do not use microphone input.

## Monochrome audio art

Three additional effects use large scrolling areas. Select **White** or **Red** with **Effect color**.
Each effect uses only the selected color and black. Brightness can change without adding other colors.
Speed controls movement. Intensity controls audio sensitivity. The palette does not affect these effects.

| Effect         | Bass                              | Mid frequencies      | High frequencies        |
| -------------- | --------------------------------- | -------------------- | ----------------------- |
| Packet Fault   | Shift scrolling horizontal bands. | Cut large gaps.      | Add brief pixel errors. |
| Bit Rain       | Light wide falling blocks.        | Extend their trails. | Break the column edges. |
| Spectral Gates | Open horizontal shutters.         | Open vertical gates. | Interrupt the gates.    |

The input meters show all three bands. Demo beat supplies separate pulses to each band.
Silence lets the brightness decay to black. Changing an effect resets its animation state.
`firmware/equator-wave/GlitchAudio.h` supplies the same integer renderer to the simulator and ESP32.
The runtime receipt pins its exact source hash. Native reference frames verify the compiled simulator output.
Native WLED selection uses red when the primary color contains red alone. Other primary colors select white.

## Preview and save

Change a computer microphone effect in the simulator, then select **Save to ESP32**.
Audio parameter changes do not save automatically. Audio preview selection pauses simulator streaming to the controller.
The save action checks the firmware renderer, LED count, and coordinate hash before it writes the standalone preset.
Firmware 2609099 does not contain these shared effects. The matching candidate firmware requires a separate attended installation.
Monochrome effects require the `audioArt` capability and matching coordinates. Equator Wave retains its existing capability check.
The save action removes segment grouping, spacing, offset, reversal, and mirroring for the shared coordinate table.

When the ESP32 connects, its supported native audio effects appear in a separate selector group.
These effects use the ESP32 microphone. Their selection does not show live audio colors in the simulator.
The current WASM build omits these native audio renderers. They must be compiled from WLED before laptop preview can work.

Review DMG microphone access uses `electron/entitlements.review.mac.plist`.
The package check requires the signed microphone entitlement and the microphone usage explanation.
A Linux Electron test verifies capture with a generated audio file. Actual macOS microphone capture still requires operator confirmation.

## Shared rendering and its limits

`firmware/equator-wave/EquatorWave.h` is the common integer renderer.
The ESP32 usermod and browser WASM runtime compile the same header bytes.
Tests compare every pixel across 100 controlled audio frames, including the return to silence.
The runtime receipt pins the shared header hash. Normal verification rejects a stale shared renderer.
Simulator generation uses `codex/equator-audio-runtime`, derived from `generate/wled-simulator`.
Keep generation source on that branch family. Move reviewed runtime bytes and their receipt to the application branch.

Equal rendering requires equal coordinates, audio levels, settings, timestamps, and random seed.
This does not establish equal readings from two microphones.
The browser measures bass at 40–250 Hz, mids at 250–2,000 Hz, and highs at 2–8 kHz.
The ESP32 reads AudioReactive channels 0–2, 3–9, and 10–15 for these bands.
Their filtering, scaling, noise handling, and microphone responses differ.
Live microphone parity requires an attended comparison and calibration; it is not yet verified.
DDP mirroring sends the simulator's rendered frames through the existing mapping path.

## Coordinates and addressing

`src/effects/EquatorMapping.ts` generates coordinates from authoritative LED positions in logical order.
The bounding-box center defines the center. Y defines vertical height; X and Z define longitude.
Uniform translation and scale preserve the normalized coordinates.
The simulator regenerates these coordinates when the project or LED count changes.
The firmware build embeds the selected project's generated coordinates and reports their SHA-256 in `equatorWave.mappingSha256`.
It requires one complete segment starting at zero, with 2,624 virtual LEDs.
Unsupported segment layouts render black. Disable grouping, spacing, reversal, and mirroring for the comparison preset.
The saved WLED LED map remains the physical addressing authority.
Before an OTA test, verify that the loaded project, embedded coordinates, and device LED map agree.
If LED positions or logical ordering change, regenerate the firmware coordinate table.

## Firmware delivery

Firmware 2609101 adds Equator Wave to a verified copy of the accepted 2609099 baseline.
Candidate 2609102 adds the three monochrome effects to that effect set.
The RMT driver, DDP receiver, and microphone processing sources remain unchanged.
The effect registers by name through a WLED usermod. It does not patch the WLED effect core.
The browser uses a local selection ID; standalone setup resolves the name against the device's effect table.
The old firmware cannot save this new standalone effect until the matching firmware is installed.

See [the build procedure](../firmware/equator-wave/README.md).
The candidate is built but not installed. Firmware 2609099 remains the physical comparison baseline.
An attended OTA test must check native audio, static and moving DDP, and repeated transitions between both modes.
Existing residual flashes remain a separate task.
