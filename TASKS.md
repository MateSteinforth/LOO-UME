# Project task board

Last reconciled: 2026-09-05
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: deliver one complete package with a unified external-frame
simulator and TouchDesigner DDP input.

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

### `P1 · FIRM-018` Recover USB Improv setup without an application restart

- Scope: investigate Improv detection failure after changing ESP32 boards during one application session.
- Evidence: BOOT was released. Restarting LOO/UME allowed setup to complete on the replacement board.
- Acceptance: recover from a timeout and board change without an application restart or an unhandled promise rejection.
- Checks: test serial cleanup, pending requests, timers, and a successful next attempt with two boards.
- Status: deferred by the operator. See F-166 in `FAILURES.md`; no software correction is confirmed.

### `P2 · REVIEW-020` Correct structural generation for saved examples

- Deferred by the operator. Ribbon junctions and surface bridges can intersect
  DOUT clearance. Some surface junctions produce degenerate triangles.
- DEV-020 retained 15 geometry test failures, including older hole/address
  expectations and blocked-anchor fixtures. The unchanged Node compiler also
  rejects the spatial-trail browser fixture at a DOUT clearance.
- Acceptance: affected saved examples compile, or clearly state unsupported
  geometry. Keep physical clearance and mesh validation checks.

### `P2 · REVIEW-021` Protect unsaved project changes

- Deferred by the operator. Project replacement and window closure can discard
  edits without a warning.
- Acceptance: track unsaved changes and confirm discard before replacement or closure.

### `P2 · REVIEW-022` Reject obsolete asynchronous project results

- Deferred by the operator. Generation and surface loading can apply an old
  result after the active project changes.
- Acceptance: bind results to project revisions and cancel obsolete operations.
- DEV-020 guards its new worker results. Surface loading and older HTTP fallback
  operations remain in this task.

### `P2 · REVIEW-023` Align firmware support across launch commands

- Deferred by the operator. Vite omits firmware routes. Local desktop and Mac
  packaging commands do not prepare their required firmware image.
- Acceptance: supported commands expose or prepare the verified image consistently.

### `P2 · DEV-021` Extend stricter Node and boundary lint checks

- Priority: after DEV-020. Both TypeScript projects already use strict mode.
  DEV-020 adds return and switch checks. A trial of Node indexed-access and
  unused-code checks found about 40 diagnostics, mostly in older tests.
- Scope: resolve those diagnostics without broad test rewrites. Assess
  `exactOptionalPropertyTypes` and selected unsafe-value lint rules separately.
- Acceptance: the added checks pass and detect useful defects without duplicate diagnostics.

### `P2 · DEV-022` Gate affected geometry and browser changes before merge

- Dependency: REVIEW-020 must establish a passing geometry baseline first.
- Scope: select relevant geometry and browser checks for pull requests. DEV-020
  adds fast behavior checks to each normal build. CI-027 keeps full regression
  available manually while the P2 failures remain deferred.
- Acceptance: source and fixture changes select the required checks. Files read
  dynamically must not disappear from dependency-based test selection.

### `P2 · DEV-023` Measure remaining test and asset preparation costs

- Priority: after DEV-020. Trial two browser workers only after tests with shared
  UDP receivers have separate ownership. Measure repeated mapping-fixture setup
  and source-asset staging before adding caches.
- Acceptance: demonstrate lower repeated-check time with unchanged coverage and
  correct invalidation. Keep one canonical mapping fingerprint check. Prefer
  contract relationships over repeated fixture-specific constants elsewhere.

### `P1 · FIRM-016` Set up official WLED firmware for supported ESP32 targets

- Scope: replace the packaged single-target image with official stable WLED
  images. Detect the connected ESP32 target, download its pinned image during
  setup, verify it, and keep a local cache. Run the complete setup from the
  Electron DMG.
- Operator expectation: connect any ESP32 target that official WLED supports.
  Start one setup action. LOO/UME selects and flashes the correct WLED image,
  provisions Wi-Fi, and configures the loaded Simulator sculpture.
- Acceptance: serial selection does not depend on one USB bridge; bootloader
  detection occurs before erase; an application-controlled manifest binds each
  supported target to official WLED URLs, flash parts, offsets, version, size,
  and SHA-256 values; a verified cache supports later offline setup; the setup
  checks target capacity and safe GPIOs before erase; unsupported capacity
  produces one exact explanation; successful setup installs buses, GPIOs,
  ledmap, boot preset, and DDP behavior from the loaded Simulator sculpture;
  post-flash readback verifies the installed target and configuration.
- Dependency: integrate FIRM-015 serial selection and package correction first.
- Review: use QUALITY mode. Test manifest rejection, download failure, cache
  corruption, wrong-target rejection, erase boundaries, recovery, and physical
  setup on each supported processor family.
- Likely conflicts: Electron serial selection, ESP32 setup, firmware receipts,
  hardware profiles, release downloads, cache storage, and setup tests.

## Ready

No tasks.

## Ready to Merge

No tasks.

## Done (latest integrations)

### `P0 · FIRM-019` Enable four ESP32 LED outputs

- Result: build `2609051` allocates 128 RMT symbols per output. The operator confirmed GPIOs 16, 17, 21, and 22.
- Delivery: integrated into `main` at `8b27334` with operator approval. Mac version `0.1.34` includes the verified USB image.
- Verification: 62 tests, four browser tests, full lint, full typed lint, TypeScript, firmware integrity, and Electron builds passed.
- Mac verification: [build 34](https://github.com/MateSteinforth/LOO-UME/actions/runs/33981301983) passed package, signature, launch, GPIO, reconnect, and credential checks.
- Download: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-macos-unsigned/LOO-UME-Electron-arm64.dmg).
- Evidence: `firmware/build-receipt.json` records the exact sources and images. Local test records are under `build/firmware-rmt4-2609051`.
- Limits: extended stability and complete sculpture address parity remain untested. The device became unreachable before the previous animation could be restored.

### `P0 · LIVE-024` Restore the project before ESP32 reconnect

- Result: save the verified project ZIP before new reconnect authorization. Restore the ZIP before discovery and report exact configuration differences.
- Delivery: integrated into `main` at `8b27334` and included in Mac version `0.1.34`.
- Verification: host persistence, failed snapshot replacement, replacement GPIO startup, and invalid snapshot recovery checks passed.
- Limit: operator review of installed-application reconnect remains.

### `P1 · WIFI-028` Simplify repeated ESP32 setup

- Result: add Wi-Fi scan controls and encrypted desktop credential storage. Keep manual network entry and firmware selection available.
- Delivery: integrated into `main` at `8b27334` and included in Mac version `0.1.34`.
- Verification: browser controls and native Mac credential encryption, restart restoration, and deletion checks passed.
- Limit: physical Wi-Fi scan review remains. FIRM-018 records the separate Improv timeout.

### `P1 · LIVE-029` Recover Art-Net input without restarting

- Result: silent Art-Net input reopens automatically after three seconds. Explicit stop cancels pending retries.
- Verification: 15 Art-Net tests, full lint, and TypeScript passed. The real UDP startup-order test fails with the previous client.
- Delivery: the operator confirmed review DMG 32 works and authorized integration and task cleanup on 2026-09-05.
- Mac verification: [build 32](https://github.com/MateSteinforth/LOO-UME/actions/runs/33980162768) passed packaging, signature, launch, GPIO, and reconnect checks.
- Implementation: `60426e8`. Includes MAD-015. The Wi-Fi review work remains separate.

### `P1 · MAD-015` Correct fixture sampling positions

- Result: small fixtures sample the LED coordinates. The 2:1 frame and physical addresses remain unchanged.
- Verification: 14 exporter, package, and preview tests passed. The center tests fail against the previous exporter.
- Delivery: included in the accepted review DMG 32 and the LIVE-029 integration.
- Implementation: `6a78c8c`. Existing MadMapper fixtures need replacement with a fresh export to use the correction.

### `P1 · CI-027` Correct repeated clean-checkout alerts

- Owner: GPT-6 Astra; branch `codex/fix-clean-checkout`; worktree `/tmp/loo-ume-clean-checkout`.
- Finding: scheduled run `33951147725` completed bootstrap setup but failed the full test suite. Broad browser regression also failed.
- Scope: retain deferred P2 geometry work. Run focused daily checks and keep full regression available through a manual workflow input.
- Acceptance: clean setup and managed-runtime fast and host tests pass. The default CI run uses the same checks as the schedule.
- Browser scope: planar generation and ZIP reopen, structural worker generation, mechanics-free authoring, wiring rotation, and manual GPIO settings.
- Mac scope: remove the Intel setup job to match the Apple Silicon-only rule.
- Limit: this change does not repair deferred geometry or broad browser regression failures.
- Corrections: use `origin/main` for manual source comparison; update the Apple Silicon bootstrap test; allow a newly spawned launcher child to reach exec.
- Local checks: clean setup, 510 fast and host tests, source checks, and all 19 launcher tests passed. The new regression detects the original startup race.
- Final verification: all eight jobs passed in [run 33954580828](https://github.com/MateSteinforth/LOO-UME/actions/runs/33954580828), including clean-checkout and browser smoke.
- Integration: apply this correction to `main` under the operator's ongoing latest-main request. Remove only this task's clean merged worktree after the push.

### `P1 · INT-026` Integrate the latest completed application changes

- Owner: GPT-6 Astra; branch `codex/integrate-latest`; worktree `/tmp/loo-ume-integrate-latest`.
- Scope: combine DEV-020, DEV-024, DEV-025, LIVE-022, and LIVE-023 into `main`.
- Acceptance: preserve manual GPIO fields, reconnect persistence, development checks, workers, and Apple Silicon package signing.
- Checks: source checks, relevant unit and browser tests, production builds, and the Mac package launch check.
- Conflicts: browser orchestration, Electron startup, and task and failure records.
- Authorization: the operator requested integration into `main`. Retain deferred P2 defects and physical hardware review.
- Result: integrated the complete branch chains without changing measured geometry or deferred P2 scope.
- Verification: 586 tests passed. The 15 existing geometry failures match the earlier DEV-020 report; no new failures appeared.
  Five browser journeys, formatting, lint, type-aware lint, TypeScript, production builds, and workflow validation passed.
- Mac verification: run `33953179437` checked the DMG signature, ARM64 launch, four GPIO edits, and reconnect authorization across restart.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-27/LOO-UME-Electron-arm64.dmg).
- Cleanup: remove this task's integrated temporary worktrees and branches after the main push. Preserve the separate LIVE worktrees and simulator-generation branch.

### `P1 · DEV-025` Correct Mac review signing

- Owner: GPT-6 Astra; branch `codex/mac-review-signing`; worktree `/tmp/loo-ume-mac-signing`.
- Scope: apply an ad-hoc signature and verify the packaged Mac application before publication.
- Acceptance: signature verification and a packaged editor launch pass on Apple Silicon.
- Dependency: includes DEV-020 and DEV-024. Apple notarization credentials are not configured.
- Conflicts: Mac workflow, review entitlements, and package checks.
- Checks: workflow validation, script syntax, DMG signature, ARM64 architecture, and packaged editor launch passed.
- Delivery: run `33952586743` built commit `86c6018`.
  [Download review 26](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-26/LOO-UME-Electron-arm64.dmg).
- Limit: the runner launch does not prove Gatekeeper approval on the operator's Mac. This review has no Apple notarization.

### `P1 · DEV-024` Build Apple Silicon Mac packages

- Owner: GPT-6 Astra; branch `codex/apple-silicon-dmg`; worktree `/tmp/loo-ume-apple-silicon`.
- Dependency: includes DEV-020 from `codex/dev-iteration`.
- Scope: build ARM64 packages and align package checks and download metadata.
- Acceptance: the Mac workflow produces a verified Apple Silicon review DMG.
- Conflicts: Mac release workflow, package command, update metadata, and download documentation.
- Checks: 12 package and desktop tests, TypeScript, and YAML validation passed.
- Delivery: Mac run `33952253932` built commit `c08bafd` and verified the packaged firmware.
  [Download the review DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-25/LOO-UME-Electron-arm64.dmg).
- Mac launch and GPIO checks now pass under INT-026. Physical device review remains separate.

### `P1 · DEV-020` Reduce development checks and repeated builds

- Owner: GPT-6 Astra; branch `codex/dev-iteration`; worktree `/tmp/loo-ume-dev-iteration`.
- Priority order: formatting and fast lint; separate TypeScript and typed lint;
  focused test groups and reliable browser ownership; incremental Electron;
  browser generation worker and a smaller generation interface in `main.ts`.
- Acceptance: documented fast checks pass without asset builds; test arguments
  reach Vitest; complete tests remain available; Electron reuses Vite and watches
  main-process code; browser generation uses the same compiler in a worker.
- Conflicts: package/configuration files, Electron startup, browser generation,
  test configuration, and development documentation. Other worktrees remain unchanged.
- Deferred: the four REVIEW-020 through REVIEW-023 problems above. Do not change
  measured geometry to resolve existing test failures.
- Review: independent review plus worker browser checks and Electron lifecycle checks.
- Result: Prettier, cached syntax lint, typed lint, strict return/switch checks,
  and separate fast/geometry/host tests are available. CI runs source and fast
  behavior checks. Brittle text and mutable-fixture assertions were corrected.
- Result: Electron development keeps Vite running and watches its main process.
  Planar and structural generation use a worker with classified errors and
  transferred asset buffers. New worker results have a project revision guard.
- Verification: 388 fast tests passed in about 15 seconds on this host while
  source checks also ran. All 117 host tests passed after correcting a
  stale demo-library assertion and removing a formatting-sensitive UI string check.
  Formatting, complete lint, TypeScript, web/Electron builds, WASM integrity,
  and workflow YAML checks passed. Chromium verified planar generation and ZIP
  reopen, structural generation and download, and mechanics-free editing.
- Limits: the complete suite still contains the deferred geometry failures.
  Electron startup, watched restart, and shutdown ran under a virtual display;
  that display blocks Electron WebGL. No physical hardware review was performed.
  The operator authorized integration under INT-026.

### `P0 · LIVE-023` Configure replacement ESP32 output GPIOs

- Result: Developer utilities shows one field for each current output. It saves
  unique approved ESP32-WROOM pins without changing routes or address order.
- Verification: 53 focused unit tests, the GPIO browser journey, application
  TypeScript, production web build, and diff checks passed.
- Dependency: this branch includes LIVE-022 so physical review keeps automatic
  reconnect. INT-026 integrates LIVE-022 with this task.
- Owner: Codex on `codex/live-023-custom-gpios` in
  `/tmp/loo-ume-live-023-custom-gpios`.
- Remaining review: set GPIO 16, 17, 21, and 22. Run ESP32 setup once. Confirm
  that all four physical chains receive their correct frames.

### `P0 · LIVE-022` Persist Electron ESP32 reconnect authorization

- Result: successful setup records reconnect authorization in Electron
  application data. A later process reads it across random loopback ports.
- Verification: the random-port restart regression, ESP32 setup tests,
  Electron tests, application TypeScript, focused Node TypeScript, Electron
  bundling, the production web build, and diff checks passed.
- Owner: Codex on `codex/live-021-persistent-reconnect` in
  `/tmp/loo-ume-live-021-reconnect`.
- Remaining review: restart local Electron after one successful setup. Confirm
  that LOO/UME finds `loo-ume.local` and enables the sculpture mirror.

### `P0 · FIRM-015` Include the verified ESP32 image in the Mac application

- Result: the Electron release includes the receipt-bound ESP32 image. CP2102
  selection, flashing, Wi-Fi provisioning, configuration, and responsive DDP
  sending passed physical Electron review.
- Verification: focused firmware, serial, DDP, package, TypeScript, Electron,
  workflow, and diff checks passed. Integrated in `main` at `144b83c` on
  2026-09-04.
- Remaining evidence: LIVE-021 owns physical LED reception and address review.

### `P1 · DOC-010` Separate user and development documentation

- Result: the root README now serves application users. Development guidance
  has one entry point at `docs/DEVELOPMENT.md`. Internal README, firmware,
  browser, and roadmap text matches the current repository and interface.
- Verification: local links in all 26 Markdown files, documented npm commands,
  user-content and stale-term guards, and diff checks passed. Integrated in
  `main` at `cc030e9` on 2026-09-03.

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

## In Progress

No tasks.

## Ready to Merge

### `P1 · LIVE-031` Rotate a physical red calibration gradient

- Owner: GPT-6 Astra; branch `codex/review-gradient`; worktree `/tmp/loo-ume-review-gradient`.
- Scope: use a black-to-red diagonal with red 255 at DIN. Keep the simulator reference fixed while rotation changes physical output.
- Acceptance: preserve GPIOs and poses. Save the same address transform used for the matching physical pattern.
- Checks: gradient and mapping parity tests; physical review browser workflow; lint and TypeScript.
- Dependency: includes the separate LIVE-030 review correction.
- Verification: 20 mapping and review tests passed. Both browser journeys passed without retries, including physical rotation and fixed simulator reference checks.
- Validation: formatting, full lint, and TypeScript passed. Native sculpture review remains required.
- Delivery: the operator approved the branch push and review DMG. Keep this branch separate from `main` pending physical review.
- Mac verification: [build 36](https://github.com/MateSteinforth/LOO-UME/actions/runs/33983195845) passed packaging and application checks.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-36/LOO-UME-Electron-arm64.dmg), built from `a6725e2e45cbf93b0c64327d360dcf7e59bd0cbb`.

### `P1 · LIVE-030` Keep physical review patterns active

- Owner: GPT-6 Astra; branch `codex/wiring-review-refresh`; worktree `/tmp/loo-ume-wiring-review-refresh`.
- Scope: show the diagnostic frame in both review modes. Refresh physical output until the operator changes panels, applies the review, or closes it.
- Acceptance: keep one diagnostic panel lit without changing GPIOs. Stop obsolete frames before device mapping writes or live output resumes.
- Checks: physical review browser test, formatting, lint, and TypeScript.
- Verification: both browser journeys passed with custom GPIOs. Checks cover sustained frames, both simulator modes, cancellation, and the mapping-write boundary.
- Validation: formatting, full lint, and TypeScript passed. Physical ESP32 review remains required.
- Delivery: the operator approved the branch push and review DMG. Keep this branch separate from `main` pending physical review.
- Mac verification: [build 35](https://github.com/MateSteinforth/LOO-UME/actions/runs/33982160555) passed packaging and application checks.
- Review package: [Apple Silicon DMG](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-review-35/LOO-UME-Electron-arm64.dmg), built from `40f2b548f031457b658b3d54b182125afe4699df`.

## Human Review

### `P0 · LIVE-021` Confirm physical sculpture DDP output

- Scope: connect the complete sculpture and compare its LEDs with the simulator.
- Acceptance: the physical sculpture receives live DDP frames. Color, panel
  order, and LED address order match the simulator.
- Dependency: use the FIRM-015 ESP32 configuration now integrated in `main`.
- FIRM-019 corrected output memory allocation. The operator confirmed all four outputs on GPIOs 16, 17, 21, and 22 on 2026-09-05.
- Read-back confirms the same four configured outputs and a complete 2,624-LED segment. Complete sculpture address parity remains unverified.
- Remaining risk: physical LED reception and complete address parity are not
  yet verified.

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

- `MAP-021`, `LIVE-020`, and `TD-010`: integrated on 2026-09-03 at `df3aa89`.
  Logical ordering is deterministic. Art-Net and DDP start automatically.
  Complete ZIP files include the verified TouchDesigner component.
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
