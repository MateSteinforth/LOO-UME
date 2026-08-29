# Project library

LOO/UME uses one `.loo.zip` package for library projects, backup, and transfer.

- `demos/` contains deterministic tracked packages generated from the authored
  `sculptures/` registry. Run `npm run generate:demo-projects` after an authored
  demo changes, then commit its synchronized ZIP and `manifest.json`.
- `local/` is the ignored writable library for operator projects. Do not commit
  its contents.

Each package contains `manifest.json`, authoritative `sculpture.json`, an
embedded pose-derived `thumbnail.svg`, and all referenced portable assets.
