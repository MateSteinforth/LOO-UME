# Browser application

`web/src/main.ts` orchestrates the LOO/UME editor. Focused modules own
portable projects, mapping, wiring, Manifold generation, rendering, and the
assembly package.

Project and View remain persistent above six editable sections: Shape, Panels,
Mapping, Generate parts, Build Hardware, and Export. Selecting a panel stops
slow auto-rotation so the editing target stays stationary. Generic boundary and
part STL files compile in the browser with pinned `manifold-3d` 3.5.1. The
loopback helper is a bounded fallback for a Manifold runtime-load failure.

Workflow sections own control alignment. Every direct child below a numbered
heading uses the shared 42 px inset and fills the remaining content width;
nested buttons fill their already-inset parent. Do not add button-specific width
rules for Optimize wiring, fabrication actions, Set up ESP32, or Export.

Mapping normally uses the deterministic pose-owned wiring optimizer. It selects
balanced outputs, GPIOs, routes, and allowed local-Z panel rotations; the
drag-and-drop route editor is under **Advanced route editor**. A generated-part
manifest narrows later rotation choices to 0/180 degrees.

The local host also provides the receipt-gated ESP32 image, bounded private-WLED
HTTP proxy, and mapped DDP sender. The browser verifies config, ledmap, preset,
boot state, device identity, and reconnect contract before live preview starts.

Use `npm run dev:web` for development, `npm run desktop` for the local
production host, and `npm run test:browser` for the Chromium journeys.

Do not infer complete-sculpture, Art-Net, audio, Ethernet, or electrical
evidence from the physically confirmed one-panel and three-panel paths.
