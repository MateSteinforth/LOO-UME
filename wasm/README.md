# WLED simulator generation

This long-lived `generate/wled-simulator` branch is the generation authority
for the checked-in browser simulator. Normal `main` does not contain or require
the WLED checkout, Emscripten SDK, Python, or rebuild scripts.

The source and compiler pins are in `upstream-revision.txt`,
`emscripten-version.txt`, and `emsdk-revision.txt`. Rebuild only on this branch:

```bash
npm run setup:wled
npm ci
npm run setup:emsdk
npm run check:wled
npm run build:wasm
npm test
```

After a reviewed rebuild, update
`web/public/wasm/runtime-integrity.json` with the exact byte lengths and SHA-256
values. Commit the runtime, receipt, and any intentional source changes here.
Move only the reviewed runtime bytes and receipt to `main`; do not merge the
generation toolchain, submodule, or source tree back into `main`.

## Shared Equator Wave renderer

The Equator Wave renderer is the byte-identical shared header at
`firmware/equator-wave/EquatorWave.h` in the application branch
`codex/bass-wave-sparks`. Copy that header to `wasm/src/EquatorWave.h` without
changes before a rebuild. Its API is `loo_equator::State`, `reset`, `advance`,
and `pixel`.

`equator_set_point` accepts a framebuffer index, longitude `0..65535`, and
height `-32767..32767`. It rejects invalid values before narrowing. A resize
replaces the point map with the framebuffer. Unmapped points render black.
`equator_reset` resets only the shared renderer state. `equator_tick` renders
to the same pixel buffer as the 30 selected WLED effects.

Build after copying the reviewed header:

```bash
npm run check:wled
npm run build:wasm
npx vitest run --config vitest.config.ts tests/wasm.test.ts
```

Update `runtime-integrity.json` with the artifact hashes, the exact header
hash, and the generator-source digest.
