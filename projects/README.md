# Project library

LOO/UME uses one `.loo.zip` package for library projects, backup, and transfer.

- `demos/` contains deterministic tracked packages generated from the authored
  `sculptures/` registry. Run `npm run generate:demo-projects` after an authored
  demo changes, then commit its synchronized ZIP and `manifest.json`.
- `local/` is the ignored writable library for operator projects. Do not commit
  its contents.

The desktop and Vite development hosts enumerate both folders through
`/api/project-library`. They validate complete packages before atomic local
saves and require revision checks for replace, rename, and delete operations.
Static builds use `manifest.json` and tracked demos only.

`npm run lan` explicitly exposes the application and this project library to
the trusted local network for review. Normal Vite and desktop startup keep the
API loopback-only.

Each package contains `manifest.json`, authoritative `sculpture.json`, an
embedded framed viewport thumbnail, and all referenced portable assets. New
packages use `thumbnail.png`; older `thumbnail.svg` packages remain compatible.

Tracked demo PNGs live in `thumbnails/`. To refresh them, start a local Vite
server, run `npm run capture:demo-project-thumbnails -- <server-url>`, stop the
server, then run `npm run generate:demo-projects`. Do not stage sculptures while
the Vite server is active.
