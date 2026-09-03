# Browser application

This directory note is for developers. Start with
[`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md).

`web/src/main.ts` orchestrates the LOO/UME editor. Focused modules own
portable projects, mapping, wiring, Manifold generation, rendering, and the
assembly package.

Project and View remain above four editable toolboxes: Shape, Fixtures,
Mapping, and Fabrication. Selecting a panel stops slow automatic rotation, so
the editing target stays stationary. Generic boundary and part STL files
compile in the browser with pinned `manifold-3d` 3.5.1. The loopback helper is
a bounded fallback for a Manifold runtime-load failure.

Workflow sections own control alignment. Every direct child below a numbered
heading uses the shared 42 px inset and fills the remaining content width;
nested buttons fill their already-inset parent. Do not add button-specific width
rules for Optimize wiring, fabrication actions, Set up ESP32, or Export.

Mapping normally uses the deterministic pose-owned wiring optimizer. It selects
balanced outputs, GPIOs, routes, and allowed local-Z panel rotations; the
drag-and-drop route editor is under **Advanced route editor**. A generated-part
manifest, or the explicit manual gate for older fabricated projects, narrows
later rotation choices to 0/180 degrees.
The manual/no-manifest path uses current saved poses as fabricated authority and
discards assumed legacy address turns during optimization.

The local host also provides the receipt-gated ESP32 image, bounded private-WLED
HTTP proxy, and mapped DDP sender. The browser verifies config, ledmap, preset,
boot state, device identity, and reconnect contract before live preview starts.

See `docs/DEVELOPMENT.md` for server and verification commands.

Do not infer complete-sculpture, Art-Net, audio, Ethernet, or electrical
evidence from the physically confirmed one-panel and three-panel paths.
