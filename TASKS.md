# Project task board

Last reconciled: 2026-08-31
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: publish one current Mac launcher download automatically,
then prove direct Art-Net behavior and static address/RGB parity on hardware.

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

### `P1 · MAP-021` Make logical LED ordering cross-platform deterministic

- Scope: replace exact raw-float ordering of symmetric LED positions with one
  documented deterministic key, then regenerate and review all mapping,
  diagnostic, deployment, and MadMapper fingerprint authorities together.
- Acceptance: Linux and macOS clean checks produce byte-identical ledmaps and
  the same golden mapping fingerprint.
- Dependency: explicit mapping-artifact review; do not change the installed
  address authority as incidental LIVE-013 cleanup.

## Ready

No tasks.

## Done (latest integrations)

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

### `P1 · INSTALL-017` Publish the current Mac launcher automatically

- Scope: build the Mac launcher after every push to canonical `main`, publish
  the verified ZIP and checksum as a permanent GitHub Release, and place one
  stable download link near the start of the README. Keep explicit version-tag
  releases and manual review artifacts available.
- Acceptance: main and version-tag pushes package on macOS; only a commit on
  canonical `main` can publish; concurrent main runs cannot publish out of
  order; every automatic release uses a unique numeric bundle version and tag;
  the README link resolves through GitHub's latest-release asset URL. Normal
  icon launch opens a visible progress terminal and reports the ready URL;
  the release includes a confirmed uninstaller that backs up local library
  projects before removing only managed installation paths.
- Owner: `codex/install-017-automatic-mac-release` in
  `/tmp/loo-ume-install-017`. Likely conflicts: Mac release workflow, launcher
  documentation, and its focused workflow-contract test.
- Verification: 14 focused launcher tests, TypeScript, shell syntax, GitHub
  Actions YAML lint, diff-check, and final integrated inspection passed. Native
  Finder progress, release publication, stable download, and uninstall remain
  Human Review after integration. The first native run exposed hidden Git
  progress and an orphaned managed listener after removal. The app performs the
  ownership-record migration before delegating, so a branch review artifact
  also works against the older `main` checkout. These corrections need a new
  native artifact review.

## In Progress

No tasks.

## Human Review

No tasks.

## Blocked

### `P1 · LIVE-010` Prove direct MadMapper Art-Net physical addressing

- Blocked by: an approved Ethernet-capable WLED controller, powered three-panel
  setup, and a computer running MadMapper on the same wired network.
- Needed: run the generated two-universe three-panel package first, then the
  16-universe 2,624-LED package; record address/RGB parity, universe boundaries,
  timeout fallback, restart behavior, sustained FPS, and incomplete frames.
- Boundary: do not add an Art-Net-to-DDP bridge unless measurements show that
  direct MadMapper-to-WLED Art-Net cannot meet the target.

### `MECH-020` Add correction tools for a proven ambiguous gap case

- Blocked by: a concrete project whose boundary gap cannot be represented or
  corrected by the current editor.
- Needed: the smallest failing Schema 2 project and the intended corrected
  corner cycle.

### `FAB-020` Add one evidence-backed fabrication enhancement

- Blocked by: a real printed-model need that is not covered by current ribbons,
  LED-surface bridges, or planar closures.
- Needed: the affected project, failed physical result, and required fit or
  fabrication outcome.

### `FAB-023` Route automatic structural connectors around DIN/DOUT

- Blocked by: the 30-panel bridge path contains exact-zero Manifold triangles;
  naive post-CAD pair exclusion disconnects the degree-2 graph or causes an
  unbounded search.
- Needed: a bounded pre-CAD path optimizer that treats keep-out and printable-
  mesh feasibility as edge costs while preserving the strict final mesh gate.

### `HW-012` Record the installed 41-panel route

- Blocked by: physical assembly.

### `FIRM-010` Add later transport or audio behavior

- Blocked by: `PROOF-010` plus explicit board, network, microphone, and
  transport decisions.

### `PROOF-010` Prove simulator-to-device address and RGB parity

- Blocked by: `HW-012` and an approved powered test setup. DIAG-010 supplies
  the exact offline frame plan.
- Needed: observe and record all 2,624 addresses, row transitions, corners,
  four outputs, and RGB channels against the exact deployment identity.

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
  a setup PDF. Eight focused tests, TypeScript, and the production build passed;
  full-load MadMapper and Ethernet evidence remains in `LIVE-010`.
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
  unknown electrical, pad, and address facts are not relabelled as measurements
  and remain subject to `PROOF-010`.
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
