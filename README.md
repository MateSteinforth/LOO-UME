# LOO/UME

LOO/UME is a visual editor and fabrication toolkit for panel-based LED
sculptures. Use it to place fixtures, preview effects, create wiring maps, and
download fabrication and control files.

## Install on Mac

[Download LOO/UME for Mac](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-macos-unsigned/LOO-UME-Electron-universal.dmg).

1. Open the downloaded DMG.
2. Drag **LOO UME** into **Applications**.
3. Control-click **LOO UME** in **Applications**.
4. Select **Open**.
5. Confirm **Open**.

This free build does not have an Apple signature. If macOS blocks it, open
**System Settings → Privacy & Security**. Then select **Open Anyway**.

LOO/UME opens one application window. Close the last window to stop the
application and its local services.

## Update LOO/UME

LOO/UME checks for a newer free build. When **Download update** appears, select
it to download the current DMG.

1. Quit LOO/UME.
2. Open the new DMG.
3. Replace **LOO UME** in **Applications**.
4. Open LOO/UME again.

Project Library files remain outside the application. An application update
does not replace these files.

## Create a sculpture project

Use **Project Library** to open an example or saved project. Use **Save** to
replace the open library project after confirmation.

LOO/UME keeps Project and View controls above four toolboxes:

- **Shape** loads an optional GLB placement surface.
- **Fixtures** places and edits panels, strips, and rings.
- **Mapping** creates output routes, GPIO assignments, and physical order.
- **Fabrication** creates printable parts, assembly guidance, hardware setup,
  and the complete project package.

Panel poses remain editable when printable parts are missing or old. A GLB is
only a placement surface. LOO/UME creates printable material from fixture
outlines and validated gaps.

## Download the complete project

Open **Fabrication**. In step 2, select **Download complete ZIP**.

The ZIP contains the editable project and all current outputs. Available
outputs include fabrication, mapping, WLED, MadMapper, and TouchDesigner files.

Keep the ZIP as the project backup. You can open the same ZIP in LOO/UME later.

## Use TouchDesigner

The complete ZIP includes `touchdesigner/loo_ume_ddp.tox` for projects with 1
through 2,624 mapped LEDs.

1. Drag `loo_ume_ddp.tox` into TouchDesigner.
2. Connect one TOP to the component input.
3. Keep **Simulator Address** at `127.0.0.1` when both applications use one Mac.
4. Start the source image.

If LOO/UME uses another computer, set **Simulator Address** to that computer's
local-network address.

The component makes a centered 2:1 image internally. LOO/UME receives its DDP
frames automatically.

## Use MadMapper

The complete ZIP includes a MadMapper folder when the physical mapping is
ready. Follow its `SETUP.pdf` instructions.

MadMapper sends Art-Net to LOO/UME on the same Mac. LOO/UME receives Art-Net
automatically. Do not send MadMapper Art-Net directly to WLED.

The newest complete Art-Net or DDP frame controls the virtual sculpture. When
the configured ESP32 connects, LOO/UME sends the same image through DDP.

If the external signal stops, LOO/UME restores its native simulation after one
second.

## Set up the ESP32

Open **Fabrication**. Select **Set up ESP32** when the project has a current
mapping.

The setup uses the approved CP2102 serial device. It can flash the verified
image, configure Wi-Fi, install the mapping, and check the saved WLED state.

LOO/UME does not save or log the Wi-Fi password.

If an output pin is unavailable, open **Developer utilities**. Set one approved
GPIO for each output. Use a different GPIO for each output. Run ESP32 setup once
after the change.

## Safety and current limits

Disconnect LED power before you change wiring. Use current-limited supplies and
separate protection for each panel branch.

LOO/UME does not approve electrical design, protection, or power distribution.
Its WLED current values are operating settings only.

The one-panel and three-panel paths have physical test evidence. Complete
2,624-pixel address verification is not planned.

## Development

For source checkout, tests, architecture, and repository commands, read
[Development](docs/DEVELOPMENT.md).
