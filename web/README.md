# Browser application

`web/src/main.ts` orchestrates the WLED Orbital Lab editor. Focused modules own
portable projects, mapping, wiring, Manifold generation, rendering, and the
assembly package.

The primary workflow is Open project, edit poses and routes, then Build or
Download assembly package. Generic boundary and part STL files compile in the
browser with pinned `manifold-3d` 3.5.1. The loopback helper is a bounded
fallback for a Manifold runtime-load failure.

Use `npm run dev:web` for development, `npm run desktop` for the local
production host, and `npm run test:browser` for the Chromium journeys.

Do not use the browser simulator as evidence for firmware, transport, network,
audio, or electrical behavior.
