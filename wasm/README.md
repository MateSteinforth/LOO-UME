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
