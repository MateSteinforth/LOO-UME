# Project task board

Last reconciled: 2026-09-03
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: send live MadMapper frames to WLED through the proved WLAN
DDP path.

## Control rules

1. Use stable task IDs in commits and handoffs.
2. Lifecycle: **Backlog -> Ready -> In Progress -> Blocked or Human Review ->
   Ready to Merge -> Done**.
3. Keep at most one implementation slice In Progress. Bounded audits may run in
   parallel when their files do not overlap.
4. Record scope, acceptance, dependencies, verification, owner branch/worktree,
   and likely conflicts only when useful.
5. Use FAST by default, STANDARD for substantial normal features, and QUALITY
   for architecture, geometry, conflict, ambiguity, or high risk. Escalate
   Luna -> Terra -> Sol only when evidence requires it.
6. FAST needs orchestrator diff inspection and focused checks. Use an
   independent review when justified in STANDARD and for QUALITY/high-risk work.
7. Completed task-branch work stops at Ready to Merge. Integrate into `main`
   only with explicit operator authorization. After verified integration and
   push, move the task to Done and clean up only task-owned resources.
8. Never force-push, discard unfamiliar changes, or delete another owner's
   branch or worktree.
9. Stop when acceptance criteria and relevant checks pass. Record later ideas
   as separate tasks.

## Backlog

No tasks.

## Ready

No tasks.

## Done (latest integrations)

### `P1 · INSTALL-018` Repair Mac application placement and reopen lifecycle

- Result: the legacy launcher installs in `/Applications`, reuses only its
  verified service, preserves local projects during updates, and removes only
  managed files. Integrated in `main` at `d59f803` on 2026-09-02.

### `P1 · INSTALL-017` Publish the current Mac launcher automatically

- Result: the legacy launcher workflow publishes reviewed automatic, tagged,
  and manual packages. Electron later replaced this launcher as the primary Mac
  application. Integrated in `main` at `be85989` on 2026-09-02.

### `P1 · MAD-014` Prevent MadMapper fixture overlap

- Result: 2,624 rectangular fixtures cover the fixed 4096 x 2048 atlas without
  interior overlap. Each rectangle contains its LED center. Physical Art-Net
  addresses, mapping fingerprint, authored mapping, and panel poses did not change.
- Verification: 12 focused export/package tests, application TypeScript,
  production web build, diff-check, and native MadMapper review passed. GitHub
  workflow run 33728004432 published Electron review 8 from the task commit.

### `P1 · CTRL-010` Reconcile live-output tasks and stale resources

- Result: direct WLED Art-Net over Ethernet is retired. LIVE-020 now owns the
  selected MadMapper loopback-to-WLAN-DDP path. Speculative blocked tasks are
  removed, and completed launcher tasks are recorded as Done.
- Verification: focused MadMapper export/package tests, application TypeScript,
  production web build, diff-check, and final resource audit passed. Integrated
  in `main` at `6427f57` on 2026-09-03.

### `P1 · MAD-013` Fill the MadMapper atlas with LED Voronoi cells

- Result: 2,624 seam-adjusted LED centers now produce clipped planar Voronoi
  polygons that touch and cover the complete fixed 4096 x 2048 SVG. Several
  cells divide each horizontal edge. Native review then found that MadMapper
  converts these polygons to overlapping rectangles. MAD-014 supersedes this
  fixture geometry. Physical Art-Net addresses, mapping fingerprint, authored
  mapping, and panel poses are unchanged.
- Verification: 12 focused export/package tests, application TypeScript,
  production web build, diff-check, rendered full-atlas inspection, and the
  published unsigned DMG workflow passed.

### `P1 · INSTALL-020` Offer free Electron DMG updates

- Result: each canonical-main unsigned DMG now publishes bounded version,
  commit, size, checksum, and fixed download metadata. A packaged free build
  validates that metadata and shows **Download update** only for a newer numeric
  version. The button opens the approved GitHub DMG; replacement stays manual.
- Verification: nine focused Electron updater/release tests, full TypeScript,
  Electron main build, production web build, workflow YAML validation, and
  diff-check passed. A second later main build is required for the first native
  old-version-to-new-version review.

### `P1 · MAD-012` Keep the MadMapper UV atlas in one 2:1 frame

- Result: the SVG uses one fixed 4096 x 2048 atlas, one global longitude seam,
  and one equal square centered on every individual LED UV coordinate. It no
  longer projects fixture corners per panel or crops the shared spherical map.
  Physical addresses, the mapping fingerprint, and `ledmap.json` are unchanged.
- Verification: 10 focused MadMapper export/package tests, application
  TypeScript, diff-check, and a rendered full-atlas inspection passed. The full
  composite TypeScript check could not resolve Electron types because the
  shared dependency installation predates Electron packaging.

### `P1 · INSTALL-019` Make Electron the default Mac application

- Scope: package the existing editor and local services as one universal
  Electron DMG, with one application-owned window, Project Library, serial and
  network boundaries, local-service lifecycle, and future signed-update seam.
- Result: closing the last window quits the application and local services; a
  later icon launch starts a fresh session. The README points to one stable free
  unsigned DMG. Application-changing canonical `main` pushes refresh that
  prerelease asset, while documentation/test-only pushes skip packaging. The
  earlier Terminal/browser launcher remains available only through an explicit
  legacy tag or manual workflow.
- Verification: focused lifecycle/release/legacy-routing tests, TypeScript,
  Electron main build, GitHub Actions YAML validation, two native universal-DMG
  reviews, canonical-main package inventory and publication, and the normal
  fast verification passed. The stable free download is
  `electron-macos-unsigned`; Apple-signed automatic updates remain optional
  future work, not part of the free installation.

### `P1 · CAL-012` Review and correct the installed physical route

- Scope: add a transactional hardware-review mode that lights one physical
  panel address block at a time with a low-brightness DIN-to-DOUT gradient.
  The operator can accept the expected virtual panel, click a different panel
  in the 3D view, and rotate its installed address calibration in 90-degree
  steps before applying the complete reviewed route.
- Acceptance: hardware review is available only for a current mapping-ready
  WLED link; without that link the same action automatically provides the
  assignment, rotation, and navigation workflow on the virtual sculpture but
  cannot apply or mutate project/device data; one
  complete physical panel block is active and all other LEDs are black;
  every physical slot is assigned to one unique existing panel; rotation
  changes address calibration only; cancel restores live preview without saved
  mutations; apply changes only route panel IDs, installed address transforms,
  calibration/lifecycle evidence, and derived mapping identity. Panel poses,
  mechanics, structural/fabrication data, controller pose, output GPIOs, and
  profile facts remain byte-identical. The proposed diff is visible before one
  final confirmation and the regenerated ledmap is activated and read back
  before live preview resumes.
- Owner: `codex/cal-012-physical-route-review` in `/tmp/loo-ume-cal-012`.
  Likely conflicts: mapping controls/orchestration, renderer selection,
  hardware-frame transport, route/calibration mutation, focused browser/unit
  tests, mapping architecture, and physical-diagnostic learnings.
- Verification: 19 focused unit tests, TypeScript, two focused Chromium
  journeys covering hardware-free demo plus physical
  selection/cancel/apply/failure reconciliation, diff-check, an independent
  QUALITY review of the transactional device path, and final integrated review
  passed. Physical 41-panel use remains operator review and does not block the
  task branch.

### `P2 · FIXTURE-015` Add an image-derived KiCad diamond-panel fixture

- Scope: model the operator-supplied KiCad screenshot as one provisional
  Schema 2 panel profile and one Project Browser demo. Preserve the visible
  clipped-diamond carrier, 8 by 8 rhombic emitter lattice, and nine board
  apertures without turning image estimates into fabrication authority.
- Acceptance: the source and bundled profile load and reload; mapping contains
  64 unique emitters on one stable GPIO 16 route; all nine carrier apertures
  cut the rendered board; rectangular-only placement and fabrication remain
  disabled; every unproved connector, address, color, dimension, and electrical
  fact stays provisional; the original reference image remains in the fixture.
- Owner: `codex/fixture-015-kicad-diamond` in
  `/tmp/loo-ume-fixture-015`. Likely conflicts: panel-carrier runtime/schema,
  carrier rendering, Project Browser registry, and panel-system documentation.
- Verification: focused carrier and fixture tests, TypeScript, schema/runtime
  round trip, Project Library packaging, production build, diff-check, and a
  separate QUALITY review passed.

### `P2 · FIXTURE-016` Build the 30-panel KiCad rhombic triacontahedron

- Scope: place 30 copies of the image-derived diamond PCB on one exact rhombic
  triacontahedron. Align the shared ideal golden-rhombus edges and retain the
  PCB's clipped-corner openings at each five-way star vertex.
- Acceptance: all poses are finite right-handed face frames; every ideal shared
  edge coincides within tolerance; the 30 PCB carriers do not overlap; vertex
  openings remain visible; the saved automatic wiring route is stable; mapping
  contains 1,920 unique emitters; the Project Library package loads and reloads
  with its exact panel profile.
- Owner: `codex/fixture-016-kicad-triacontahedron` in
  `/tmp/loo-ume-fixture-016`. Likely conflicts: KiCad demo sources, project
  registries/packages, fixture tests, and panel-system documentation.
- Verification: exact polyhedron adjacency/edge tests, 23 focused fixture and
  editor tests, TypeScript, production build, diff-check, a separate geometry
  review, and a final rendered-image check without edit-hitbox quads passed.

### `P1 · INSTALL-016` Add a self-installing Mac launcher release

- Scope: publish a lightweight `LOO UME.app` that copies itself to
  `~/Applications` on first launch, installs a canonical `main` checkout below
  `~/Library/Application Support/LOO-UME/`, runs verified setup internally,
  and opens the browser editor. The `looume` launcher also provides launch,
  update, stop, and status commands for advanced use.
- Acceptance: the normal Mac path requires no Terminal command; installation
  is bounded and retryable; launches reuse one owned server; updates retain
  local projects and use the canonical-main fast-forward gate; a tagged GitHub
  workflow publishes the launcher ZIP as a separate release asset.
- Verification: 18 focused launcher/bootstrap/restart tests, shell syntax,
  TypeScript, GitHub Actions YAML lint, diff checks, and independent review
  passed. Native review remains required after the first tagged asset is built.

## Ready to Merge

### `P1 · MAP-021` Make logical LED ordering cross-platform deterministic

- Result: logical order uses one-billionth normalized UV bins, then panel ID
  and panel-local coordinates. Raw geometry and physical route order stay
  unchanged.
- Owner: `codex/map-021-deterministic-order` in `/tmp/loo-ume-map-021`.
- Verification: 68 focused tests, application TypeScript, production web
  build, YAML validation, and diff-check passed. GitHub workflow run
  33735838342 produced identical address artifacts and fingerprint `524500f5`
  on Ubuntu and macOS.

### `P1 · LIVE-020` Send MadMapper output to the sculpture through WLAN DDP

- Result: separate Receive and Sculpture output controls send only complete
  Art-Net frames. The browser converts physical Art-Net order to logical DDP
  order, so WLED applies its installed ledmap one time. A latest-frame queue
  limits backpressure. Project, mapping, device, setup, and physical-review
  changes stop output.
- Decision: the operator accepted the current behavior without the planned
  three-panel review on 2026-09-03. Correct it if later evidence differs.
- Owner: `codex/live-020-wlan-ddp` in `/tmp/loo-ume-live-020`.
- Verification: 61 focused unit tests, four Chromium journeys, application
  TypeScript, production web build, and diff-check passed.

## In Progress

### `P1 · TD-010` Export one complete project package with TouchDesigner output

- Scope: make the normal download contain the editable project, current print
  files, mapping, WLED, MadMapper, and TouchDesigner deliverables.
- TouchDesigner path: accept one 2:1 TOP, sample the current pose-derived UV
  positions in logical LED order, and send bounded DDP frames through WLAN.
- Acceptance: include one template without an external plugin. Report its
  target, mapping fingerprint, frame rate, and replaced frames.
- Dependency decision: the operator accepted LIVE-020 behavior as an
  assumption on 2026-09-03. Correct TD-010 if later hardware evidence differs.
- Owner: `codex/td-010-touchdesigner-package` in `/tmp/loo-ume-td-010`.
- Likely conflicts: package generation, MadMapper package output, mapping
  documentation, browser controls, and LIVE-020 output interfaces.

## Human Review

No tasks.

## Blocked

No tasks.

## Retired

- `LIVE-010`: retired on 2026-09-03. Direct MadMapper-to-WLED Art-Net over
  Ethernet is no longer the selected path. `LIVE-020` uses WLAN DDP instead.
- `MECH-020`, `FAB-020`, and `FIRM-010`: removed as speculative placeholders.
  Add a new task only when an operator supplies a concrete requirement.
- `FAB-023`: deferred. The known automatic connector limit remains in F-034.
  Add a new task only when the 30-panel automatic connector path is required.
- `HW-012` and `PROOF-010`: retired by operator decision on 2026-09-03.
  CAL-012 keeps the optional panel-by-panel physical wiring review. A complete
  2,624-pixel proof is not planned.

## Earlier completed work

- `UI-032`: integrated panel-by-panel physical assembly focus on 2026-08-30.
  Previous/Next panel crosses nonempty data chains, activates the selected
  panel and its incident solder cables, and mutes the remaining chain context.
  Reliably owned printable closures follow the same focus; unknown combined
  assets remain visible. Focused unit tests passed 9/9, Chromium passed 5/5,
  TypeScript and diff checks passed, and independent review found no blocker.
  Physical use on the next chain remains operator review.

- `WIRE-017`: integrated the optimized post-fabrication wiring authority on
  2026-08-30. The saved revision-4 flagship is an exact optimizer fixed point
  at 2,302.399 mm with identity installed-address transforms and mapping
  fingerprint `e9fe0e65`. The manual 0/180-degree gate preserves printed
  mounts, while new pre-fabrication projects can use all four quarter turns.
  Virtual PCBs show the six physical openings and back-only rings: DIN green,
  DOUT red, and usable mounting holes gold. Focused tests, TypeScript,
  sculpture validation, Chromium, diff-check, and independent review passed.

- `LABEL-011`: calibrated the HERMA 4385 PDF to the physically confirmed stock
  geometry on 2026-08-30: 12 mm left margin, 11 mm right margin, and fourteen
  equal 37/14 mm horizontal gaps across fifteen 10 mm labels. The PDF keeps
  printer displacement outside its document coordinates. Focused tests,
  TypeScript, A4/PDF inspection, independent review, and operator print review
  passed.

- `UI-031`: integrated the compact Project Library action area on 2026-08-29.
  The filename is the only full-width row; Save, Open/Import, and
  Download/Inspect use three desktop columns and one mobile column.

- `LIB-016`: integrated the file-browser-style Project Library on 2026-08-29.
  Thumbnails appear first and sort newest first; the filename field spans the
  save section; local and bundled entries support revision-gated rename,
  delete, and confirmed overwrite through update-safe local overlays.

- `UI-030`: integrated one complete fabrication ZIP on 2026-08-29. It contains
  the HERMA label PDF, a paginated manufacturing manual PDF, every current
  verified planar STL, and the complete current verified structural connector
  package; stale geometry stays excluded.

- `INSTALL-015`: integrated dirty-safe shell updates and a loopback-only
  in-application update notice/button on 2026-08-29. Updates are serialized,
  preserve tracked and untracked work plus local project ZIPs, and retain exact
  recovery evidence if restoration conflicts.

- `UI-029`: integrated selectable 6DOF controller pose editing, shared
  controller-pin geometry, safe optimizer-evidence invalidation, and reset to
  deterministic suggested placement on 2026-08-29.
- `INSTALL-014`: integrated one-command `./bootstrap.sh launch` and guarded
  `./bootstrap.sh update` on 2026-08-29. Launch binds reusable builds to the
  target, clean commit, runtime packages, and complete production-output hash
  manifest. Update permits only clean fast-forward changes from canonical
  `origin/main`. Focused tests, TypeScript, the production build, the Manifold
  install proof, two real launches, browser opening, and independent review
  passed.

- `FIXTURE-013`, `FIXTURE-014`, and `UI-028`: integrated the provisional wedge
  panel profile, its one-panel and 30-panel visual-study projects, reusable
  Project Library switching, manual-only viewport orbit, saved controller XYZ,
  and clear library/export labels on 2026-08-29. The 30-panel radius, poses, and
  hardware facts remain provisional; fabrication stays unavailable. The
  combined main passed all 480 unit tests, TypeScript, production build, and
  four focused Chromium Project Library/controller journeys.

- `LIVE-011` through `LIVE-013`: integrated the local MadMapper 3D preview on
  2026-08-29. The current Mapping toolbox owns Start/Stop, complete 16-universe
  loopback Art-Net frames render on the pose-derived LEDs, and the MadMapper ZIP
  includes its importable routing CSV. macOS Human Review passed at about 40
  completed frames per second; MadMapper Demo's 30-second DMX blackout remains
  an external review limit. All 473 unit tests, TypeScript, production build,
  and nine focused Chromium journeys passed after current-main integration.

- `LIB-010` through `LIB-015`: integrated the ZIP Project Library, conflict-safe
  local saves, consolidated open/backup actions, and framed viewport thumbnails
  on 2026-08-29. The integration preserves the current Fabrication UI and
  flexible-ring format; all 14 authored demos have a ZIP and PNG thumbnail, and
  the ring ZIP includes its project-local panel profile. All 462 unit tests,
  TypeScript, production build, and eight focused Chromium journeys passed.

- `UI-027`: integrated one Fabrication toolbox for part generation, the unified
  label-and-current-connectors ZIP, the data-chain assembly tutorial, and ESP32
  testing on 2026-08-29. Focused ZIP/PDF tests, TypeScript, production build,
  Chromium, stale-artifact regression, operator LAN review, and independent
  review passed.

- `FIXTURE-012`: integrated the 1,000 mm diameter flexible LED-ring demo with
  188 outward-radial emitters and one GPIO 16 output on 2026-08-29. Mapping,
  wiring, WLED setup, portable export/reload, focused tests, TypeScript,
  Chromium, and independent geometry review passed. Rectangular-only placement
  and fabrication remain disabled for this carrier.
- `FIXTURE-010` / `FIXTURE-011` / `UI-026`: integrated explicit pose-local
  emitter and DIN/DOUT coordinates, arbitrary planar and flexible-path carrier
  display geometry, profile-driven capability gates, and the unnumbered toolbox
  sidebar on 2026-08-29. The legacy 41-panel project remains byte-equivalent;
  focused fixture, mapping, WLED, boundary, UI, TypeScript, build, and
  independent reviews passed.

- `LABEL-010`: integrated the HERMA 4385 multi-page panel-label PDF and DIN-end
  simulator label placement on 2026-08-29. The operator confirmed the browser
  export. Focused tests, TypeScript, production build, PDF 1.7/A4 inspection,
  and independent review passed.

- `MAD-010` / `MAD-011`: integrated the mapping-ready MadMapper ZIP download
  on 2026-08-28. It exports 2,624 pose-positioned physical RGB fixtures in 41
  panel groups, direct addresses over 16 universes, CSV/JSON information, and
  a setup PDF. Eight focused tests, TypeScript, and the production build passed.
  MAD-014 later corrected the fixture geometry. LIVE-020 owns live WLAN output.
- `WIRE-016`: integrated automatic balanced data routing, GPIO 16–19
  assignment, pose-owned DIN/DOUT orientation, the durable pre/post-fabrication
  rotation gate, and the Advanced manual route editor on 2026-08-28. Focused
  optimizer/mapping/tutorial tests, TypeScript, Chromium, diff checks, physical
  LAN UI review, and independent review passed.
- `UI-025`: integrated panel-selection auto-rotation stop and synchronized View
  state on 2026-08-27. Reconciled current operator, architecture, hardware,
  firmware, mapping, workflow, CI, and failure-learning documentation;
  TypeScript, diff checks, stale-contract scan, and independent review passed.
- `UI-024`: integrated the always-editable six-step fabrication workflow,
  persistent View animation controls, Build Hardware assembly/ESP32 controls,
  compact action layout, and revised renderer lighting on 2026-08-27.
- `UI-023`: integrated the compact View control layout and standard framebuffer
  selector through UI-024 on 2026-08-27.
- `CI-012`: integrated nightly broad Vitest, Chromium, Manifold, bootstrap, and
  clean-host verification while keeping push/PR automation to the fast build
  gate on 2026-08-27.

- `UI-022`: integrated the full-height aspect-safe viewport, compact View
  controls, Plane/World transform toggle, plain tutorial panel IDs, button-only
  chain navigation, two-column placement controls, and atomic LAN staging on
  2026-08-27. Focused unit checks, TypeScript, diff checks, and independent
  review passed; the broad browser suite was not rerun by operator request.
- `CI-011`: normal pushes and pull requests now run only the locked install,
  checked-in WLED runtime verification, TypeScript, and production build. The
  full browser, Vitest, Manifold, bootstrap, and host matrix remains available
  through **Run workflow**; integrated on 2026-08-27.
- `UI-021`: DIN/DOUT and panel-wiring switches now control their scene layers
  during chain isolation, survive navigation, and remain selected after exit.
  The stable LAN preview command and P1 MadMapper bridge task are included;
  integrated on 2026-08-27.
- `UI-020`: integrated the interactive chain-by-chain wiring tutorial, compact
  two-column controls, red current-wire focus, muted selected-chain context,
  populated 41-panel default, improved LED depth separation, gradient backdrop,
  and three-point scene lighting. Focused tests, TypeScript, diff checks, and
  independent reviews passed; integrated on 2026-08-27.
- `FIRM-015`: pose-only panel edits now update and activate the exact spatial
  WLED ledmap before preset persistence and DDP resume. Route, calibration,
  output, color-order, malformed-map, and identity changes remain fail-closed.
  The operator accepted the physical result and requested integration on
  2026-08-27; 387 tests, TypeScript, Vite, and independent review passed.
- `FIRM-014`: copied loaded 1–41-panel simulator playback to WLED with exact
  config, ledmap, preset, and boot-state read-back; gamma-corrected DDP live
  mirroring; bounded reconnect; and persistent native fallback. On 2026-08-26,
  the operator confirmed connection, effect changes, tab-close fallback, page
  reload reconnect, and power-cycle restoration on the 192-LED three-panel
  sculpture.
- `PWR-010`: removed from repository scope by operator decision. External
  electrical design and protection are operator responsibilities; generated
  WLED current values are operating assumptions, not an electrical approval.
- `FIRM-013`: stabilized physical CP2102 flashing, serial Improv setup,
  private-device read-back and reconnect, and the physically mapped live 8x8
  simulator link. The operator completed setup at `192.168.68.53`; 366/366
  tests, TypeScript, Vite, focused browser journeys, and review passed.
- `FIRM-012`: integrated the receipt-verified BUILD HARDWARE ESP32 flash,
  private Wi-Fi provisioning, `loo-ume.local` identity, one-panel simulator
  state transfer, and device read-back; physical browser/USB review passed on
  2026-08-25. Full-install mode remains unavailable.
- `FIRM-011`: the pinned WLED binary flashed successfully to the ESP-WROOM-32;
  the operator confirmed the 64-pixel GPIO16 smoke configuration, GRB colors,
  straight 0–63 row-major address walk, reboot persistence, and stable operation.
- `CAL-011`: measured GRB/order-0 and front-view straight row-major addressing
  were integrated in `main` at `80a1225`. WIRE-017 preserves those facts while
  replacing that historical route fingerprint with the current optimized
  mounting-aligned mapping fingerprint `e9fe0e65`.
- `DIAG-010`, `ARCH-010`, `CAD-020`, `PLACE-010`, `FAB-022`, `SEC-010`, and
  `MAP-020`: the reviewed unblocked implementation batch is integrated in
  `main` at `d51e8bb`; integrated Vitest passed 348/348 with TypeScript and Vite.
- `HR-006`: operator printed representative Manifold parts and confirmed on
  2026-08-25 that they work.
- `FAB-021`: corrected structural PCB back-view coordinates and added
  fail-closed DIN/DOUT keep-outs for ribbons, LED-surface bridges, and merged
  junctions in `main` at `4961f4d`; unsafe automatic paths now stop instead of
  exporting overlapping parts.
- `DOC-010`: integrated the ten-page connector design-process HTML/PDF and five
  current UI images in `main` at `4c8c82c`; its task worktree and branches were
  removed after the verified push.
- `TRUSS-011`: integrated connector ribbons, LED-surface bridges, four JSON
  presets, switchable surface/free-6DOF editing, Advanced Tools settings, and
  exact displayed-connector ZIP export in `main` at `641cf6b`; its source and
  integration worktrees and branches were removed after documentation and
  integration completed.
- `INSTALL-012`: the restricted-PATH one-command setup passed on Linux x86-64
  and native macOS arm64/x86-64 in integration run `32656402016`; no global
  Node/npm installation or administrator command is required.
- `INSTALL-011`: added one-command pinned repository-local Node/npm setup,
  locked dependency installation, desktop build, and Manifold production proof.
- `VALID-011`: centralized deep Schema 2 validation for browser and CLI input,
  including mapping, calibration, boundary, asset, and note contracts.
- `VALID-010`: made LED grid dimensions profile-driven through mapping,
  validation, export, reload, rendering, and rectangular-turn safeguards.
- `LEGACY-011`: retired the Schema 1 schema, migration fixture/script,
  procedural mapping path, and legacy-only tests; the 41-panel Schema 2 project
  and deployment artifacts remain byte-identical.
- `BUILD-010`: normal development and CI now verify the checked-in WLED
  simulator without Python, Emscripten, or a WLED checkout. Reproducible source
  generation remains on `generate/wled-simulator` at `64b743a`.
- `WIRE-012`: integrated the shared guarded browser/CLI deployment policy in
  `main` at `d900cdb`; mapping-ready input gets exact WLED installation files,
  while draft or stale input gets only explicit diagnostic artifacts.
- `CTRL-008`: recorded the operator-approved visual, panel-profile, WLED
  generation, Schema 2, stale-mechanics, and boundary-format decisions in
  `main` at `ee8f79f`; physical Manifold print review remains open as `HR-006`.
- `UI-011`: operator approved the opaque glossy black PCB appearance.
- `CAL-010`: operator approved the existing panel profile for the current
  41-panel build. Existing measured values stay measured; provisional or
  unknown electrical, pad, and address facts are not relabelled as measurements.
- `HR-013`: normal `main` will use the checked-in WLED simulator and will not
  require Python or Emscripten; reproducible generation moves to a dedicated
  branch under `BUILD-010`.
- `HR-005`: confirmed the 41-panel authority is Schema 2; `LEGACY-011` retired
  the remaining Schema 1 migration dependencies.
- `HR-008`: stale generated parts stay hidden until regeneration; no stale-part
  inspection toggle is required.
- `HR-009`: keep JSON poses/topology and STL output; do not add another boundary
  asset format without a concrete future need.
- `UI-019`: removed the performance overlay and individual-file export menu,
  moved secondary display and GLB controls into Advanced Tools, and unified
  operator messages in one activity log in `main` at `6615c54`.
- `CTRL-007`: removed the retired printable toolchain and its generated
  artifacts, made Manifold the only printable-parts kernel, and established
  FAST/STANDARD/QUALITY execution and Luna/Terra/Sol routing in `main` at
  `33d6455`.
- `UI-012`–`UI-018`: integrated browser-first Manifold status, generation,
  package/manual downloads, bounded JSON fallback, simplified controls, and
  unified project/route/package workflow in `main` at `e278333`.
- `CAD-030`–`CAD-037`: pinned Manifold solids, browser/local compilation,
  exact assets, pose-only caps, labels, planar tolerances, and CI proof.
- `WIRE-010`–`WIRE-015`, `MAP-021`, `MAP-022`, `MAP-030`, `HW-016`, `HW-017`:
  authored routes, lifecycle, route editor, assembly manual, installed address
  transforms, GPIO/bus contract, and corrected mapping assumptions.
- `CORE-001`, `ASSET-001`, `BOUNDARY-001`, `PARTS-001`, `PORTABLE-001`,
  `TEST-010`, `TEST-011`: pose-first editor, portable assets, validated
  boundary, exact parts, folder/ZIP support, and real browser journeys.
- `CTRL-001`–`CTRL-005`: persistent task board, safe workflow, failure learning,
  architecture reconstruction, and simulator-to-hardware priority.
