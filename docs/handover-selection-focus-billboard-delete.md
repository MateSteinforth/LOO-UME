# Handover: selection focus, billboard deletion, and background deselection

This is the next focused editor slice after commit `0917794`
(`Decouple panel JSON editing from mechanics`) on
`feat/manual-rhombicosidodecahedron`.

Start from the latest remote state of that branch. Read
[AGENTS.md](../AGENTS.md), [Pose-first sculpture schema](pose-first-schema.md),
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md),
and [Automatic panel placement handover](handover-automatic-panel-placement.md)
before changing code.

## User expectation

Panel editing must stay visually legible from every camera angle:

- the selected panel's delete control is always visible above sculpture geometry;
- the delete control is a billboard that always faces the camera;
- selecting a panel leaves that panel and its editor controls at normal color and
  brightness;
- every non-selected scene element becomes grey at 60% of its normal brightness;
- clicking empty background deselects the panel and restores the exact normal
  rendering state; and
- dragging empty background continues to orbit the camera without deselecting.

Treat this as an editor interaction and renderer-focus slice. It must not change
schema-2 JSON, panel poses, mapping, wiring, mechanical compatibility, CAD,
OpenSCAD, or printable geometry.

## Current state to preserve

Commit `0917794` established:

- mechanics-independent panel selection, rotation, local-plane translation,
  surface-following translation, creation, and deletion;
- immediate mapping and provisional wiring refresh from authoritative JSON;
- generated-mechanics staleness and manual-mechanics `requires-review` state;
- an explicit `EditorCapabilities` model shared by UI and gizmo behavior;
- surface-free pointer-plane translation with a pointer-down offset;
- zero-panel manual projects; and
- a fast `npm run test:panel-editing` suite that does not invoke CAD or
  OpenSCAD.

The unedited manual rhombicosidodecahedron must remain 41 panels, 2,624 LEDs,
chain lengths `[11, 10, 10, 10]`, and fingerprint `31291c59`.

Do not merge mapping/wiring export with 3D print generation. Do not reinterpret
manual U-frames, middle connectors, or triangle fillers as generic caps.

## Confirmed current visual problem

`SurfacePlacementController.updateGizmo()` currently builds the delete control
as a circle and cross under the selected panel's local gizmo transform. It has
high `renderOrder` and `depthTest: false`, but it still inherits the panel
orientation. As the camera orbits, the circle can become edge-on, project behind
other controls, or be visually lost among dense sculpture geometry.

Selection currently changes only the transparent editor target and panel-label
class. The LEDs, panel surfaces, panel outlines, printable layers, connectors,
wiring, authoring surface, and occlusion core retain their normal colors. There
is no single renderer focus state that can restore all normal colors exactly.

Empty-canvas pointer gestures currently fall through to `OrbitControls`. A
background click does not deliberately deselect, and the interaction code must
not confuse a background click with an orbit drag or with a click on an active
authoring surface.

## Terminology and exact behavior

### Selected content

For a selected panel, keep these at their normal rendering state:

- all 64 LEDs belonging to the selected `panelId`;
- the selected panel surface and outline;
- the selected panel label;
- the local-XY translation control;
- the local-Z rotation control; and
- the delete billboard.

The editor controls may keep their established cyan/red/green/blue colors and
full brightness. The selected panel label must remain readable and interactive.

### Non-selected content

While a panel is selected, render all other visible scene content as neutral
grey at 60% of its normal displayed brightness. This includes:

- LEDs from every other panel;
- other panel surfaces and outlines;
- other panel labels;
- filler/shell and printable closure previews;
- mechanical mounts and connector markers;
- wiring routes, arrows, DIN/DOUT markers, and controller preview;
- the optional GLB or JSON-shell authoring surface; and
- the occlusion core where visible.

“Grey” means remove hue while preserving useful luminance differences. “60%
brightness” means multiply the normal linear/display brightness by `0.6` after
deriving a neutral luminance; do not interpret it as 60% opacity. Avoid making
transparent objects more opaque. Existing visibility toggles and shell
transparency remain authoritative.

Suggested deterministic color transform for an RGB color is:

```ts
const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
const focusedGrey = luminance * 0.6;
return [focusedGrey, focusedGrey, focusedGrey];
```

Apply the transform in a consistent color space. If colors are already linear
Three.js values, keep the calculation linear. Tests should assert the chosen
contract rather than accepting arbitrary CSS grey.

### Background

For this slice, “background” means a pointer gesture on the WebGL canvas that
hits none of:

- a delete, rotation, or translation control;
- a panel editor target;
- an interactive panel label; or
- an active GLB/JSON-shell authoring surface.

A click on another panel selects that panel. A click on an active authoring
surface retains the existing add-panel behavior when creation is enabled. Do
not turn an authoring-surface click into background deselection.

## Required architecture

### One authoritative selection-focus state

Keep one selection value, `selectedPanelId: string | null`, and propagate it
from `SurfacePlacementController` into `SphereRenderer`. Use that value for:

- editor target highlighting;
- gizmo and delete-billboard visibility;
- panel-label selected state;
- per-panel LED focus;
- scene-layer focus dimming; and
- full normal-state restoration on deselection.

Do not create a second independent “focused panel” state that can drift from
editor selection. `onSelectionChange` already connects the controller to
`SphereRenderer`; extend that route so rendering updates in the same selection
transaction.

Selection is view state only. Selecting or deselecting must not rebuild the
panel assembly project, mutate `editorDefinition`, mark mechanics stale, resize
WLED, regenerate mapping/wiring, download JSON, or invoke CAD.

### Reversible renderer focus

Implement focus as a derived renderer state. Do not destructively overwrite
material colors and later guess their originals.

Good implementation strategies include:

1. retain canonical/base colors alongside mutable display color attributes and
   derive focused colors from the base values; or
2. use a shared shader uniform plus per-vertex/per-instance selection metadata
   where batching makes that practical.

Whichever strategy is selected must handle the current batching:

- all LED points share one geometry and material, but every
  `LedMappingEntry` has `panelId`;
- panel surfaces and outlines are currently batched into shared geometries;
- printable closures, connectors, wiring, and mounts are separate groups with
  shared or per-object materials; and
- panel labels are CSS2D elements rather than WebGL materials.

Do not solve batching by rebuilding mapping or allocating new materials every
animation frame. It is acceptable to rebuild small decoration buffers when
selection changes, but WLED color updates still occur every frame and must stay
cheap.

A useful split is:

```ts
setSelectedPanel(panelId: string | null): void
applySelectionFocus(): void
focusedColor(baseColor, isSelected): Color
restoreUnfocusedRendering(): void
```

For LEDs, preserve the current WLED/physical/logical display color as the base
color. In `updateColors()`, leave entries whose `entry.panelId` matches the
selection unchanged and transform every other entry to grey/60%. Deselecting
must immediately resume the exact current effect colors, not stale colors from
before selection.

For batched panel surfaces/outlines, retain enough panel ownership information
to leave only the selected panel normal. Do not leave the selected panel grey
merely because it shares one `BufferGeometry` with other faces.

For labels, use a focus CSS class or inline style driven by the same selection.
Non-selected labels should become neutral grey and 60% brightness without
losing their ability to select another panel.

### Billboard delete control

The delete control must no longer inherit a fixed panel-local orientation.
Use a camera-facing implementation with a stable, generous hit target.

Preferred options are:

- a `THREE.Sprite` with a transparent circle/X texture and a matching sprite
  raycast target; or
- a dedicated billboard group whose world quaternion copies the camera
  quaternion before each render.

A CSS2D button is also valid if it integrates cleanly with existing label-layer
pointer behavior and remains anchored to the selected panel, but it must not
block background orbit gestures outside its own hit box.

Requirements:

- anchor the control near the selected panel's upper-right corner, displaced
  slightly outward along the panel normal;
- keep it camera-facing through every orbit frame, not only when selection
  changes;
- keep a roughly stable apparent screen size across the allowed camera zoom
  range;
- use `depthTest: false`, `depthWrite: false`, and a render order above all
  sculpture/editor geometry for a WebGL implementation;
- ensure both the red disc and white X render above geometry;
- ensure the raycast/hit target follows the visible billboard exactly;
- preserve `EditorCapabilities.canDeleteSelectedPanel` visibility and
  interaction gating;
- remove/dispose the billboard when selection clears, the selected panel is
  deleted, mapping reloads without that ID, or the renderer/controller is
  disposed; and
- do not let the billboard be dimmed by selection focus.

`renderOrder` alone is insufficient if the control remains edge-on. Likewise,
copying the camera quaternion once in `updateGizmo()` is insufficient because
the camera moves continuously under `OrbitControls`.

Consider separating the camera-facing delete control from the panel-local
translate/rotate gizmo. The translate pad and local-Z ring should continue to
express the panel's local frame; only the delete affordance must billboard.

### Background click versus orbit drag

Add an explicit background gesture candidate to
`SurfacePlacementController`, including pointer ID and pointer-down client
coordinates.

Recommended contract:

```ts
interface BackgroundPointerCandidate {
  pointerId: number;
  x: number;
  y: number;
}
```

On primary-button pointer down:

1. process delete/rotate/translate handles first;
2. process panel targets second;
3. process the active authoring surface third;
4. if none hit, record a background candidate;
5. do not capture the pointer and do not disable `OrbitControls` for a
   background candidate.

On pointer move, leave `OrbitControls` untouched. On pointer up:

- if the same pointer moved no more than the established click threshold
  (currently 5 CSS pixels is used for surface clicks), call `select(null)`;
- if it moved farther, treat it as an orbit drag and preserve the current
  selection;
- clear the candidate on pointer up/cancel;
- ignore non-primary buttons and mismatched pointer IDs.

A background click should restore normal rendering through the same selection
callback path. Do not add a renderer-only deselect that leaves the controller
thinking a panel is still selected.

Dragging from a panel label, panel target, gizmo, or delete billboard must not
be mistaken for a background drag. A surface click must keep add-panel
semantics. OrbitControls should still receive ordinary empty-background drag
input.

## Interaction ordering and raycasting

The always-on-top delete control is also logically topmost. Test raycast
priority explicitly:

1. delete billboard;
2. rotation/translation handles;
3. panel targets;
4. active authoring surface;
5. empty background.

If a camera-facing delete billboard visually overlaps another panel, clicking
its visible bounds must request deletion of the selected panel, not select the
panel behind it.

Avoid invisible oversized hit geometry that makes nearby panels or background
impossible to click. The hit area may be slightly larger than the visible disc
for touch use, but document and test the size.

## Renderer state restoration

Deselecting must restore exact normal rendering for the current state:

- current WLED frame and display mode;
- shell transparency slider value;
- visible/hidden printable, connector, wiring, and output-route layers;
- output-route colors;
- panel face colors and outlines;
- label classes and opacity;
- authoring-surface opacity/color; and
- auto-rotation/orbit state.

Do not hard-code “normal” defaults during restoration. A user may change a
layer toggle, shell transparency, output visibility, effect, palette, or display
mode while a panel is selected. The focused view must derive from those current
base settings, and deselection must reveal them without requiring a mapping
reload.

Selection focus should survive ordinary camera orbit and WLED animation.
Selection should remain on the same panel after rotation or movement commits,
as established by commit `0917794`. Successful deletion clears selection and
therefore restores the normal rendering state.

## Accessibility and touch

- Keep the delete control large enough for a phone touch target; target roughly
  40–44 CSS pixels if implemented as HTML, or the corresponding stable
  projected size for a sprite.
- Preserve a clear accessible name such as `Delete selected panel P-01` for an
  HTML implementation.
- Keep panel labels keyboard-selectable.
- If the WebGL billboard cannot be keyboard focused, retain an equivalent
  accessible delete button in the editor UI or use a CSS2D/HTML control.
- Pointer cancellation must never leave OrbitControls disabled or the scene
  permanently dimmed.

## Tests

Add a dedicated fast suite or extend `tests/panel-json-editing.test.ts` and a
controller/renderer-focused suite. Tests must not generate CAD, STL, previews,
or invoke OpenSCAD.

At minimum cover:

1. selecting a panel sets exactly one authoritative selection ID;
2. selected-panel LEDs retain their normal current WLED colors;
3. non-selected LEDs become neutral grey at exactly 60% brightness;
4. changing WLED colors/display mode while selected updates the focused result
   from the new base colors;
5. deselection restores exact current LED colors;
6. selected panel surface and outline remain normal while other panel surfaces
   and outlines are grey/60%;
7. printable mechanics, shell/fillers, mounts, connectors, wiring, controller,
   and authoring surface are grey/60% while focused;
8. visibility toggles and shell transparency remain unchanged through
   select/deselect;
9. non-selected labels are grey/60%, the selected label remains normal, and all
   labels remain selectable;
10. the delete control faces the camera initially and after multiple camera
    quaternion changes;
11. the delete control keeps stable apparent size across min/max editor zoom;
12. delete billboard materials use no depth test/write and render above all
    sculpture geometry;
13. clicking an overlapping delete billboard wins over a panel behind it;
14. delete capability false hides and disables the billboard;
15. deleting the selected panel removes/disposes the billboard and restores
    normal focus;
16. mapping reload that removes the selected ID clears selection and focus;
17. a stationary empty-background click deselects;
18. an empty-background movement over the click threshold orbits and preserves
    selection;
19. pointer cancel clears gesture state without deselecting unexpectedly;
20. panel, label, gizmo, delete, and authoring-surface gestures never trigger
    background deselection;
21. selection and focus work for manual mechanics without a GLB or mechanical
    shell;
22. the manual golden mapping remains 41 panels, 2,624 LEDs,
    `[11, 10, 10, 10]`, and fingerprint `31291c59`; and
23. the full existing editor and mapping suites remain green.

Prefer extracting pure helpers for color focus, click/drag classification, and
billboard transform/scale calculations so the important behavior can be tested
without a WebGL context. A small browser-level interaction test is still useful
if the repository test environment can support it without introducing a heavy
or flaky dependency.

## Verification

Run the fast view/editor checks first:

```bash
npm run test:placement
npm run test:panel-editing
npm run test:editor
npm test
npx tsc -b
npx vite build
npm run validate:sculpture
```

Because this slice is view-only, do not regenerate CAD during normal iteration.
Run OpenSCAD verification only if CAD generation, SCAD, topology regeneration,
connector allocation, or printable geometry changes. Never claim printable
output was verified unless OpenSCAD actually rendered it.

For phone review, follow the repository `AGENTS.md` tunnel contract:

- start Vite on `0.0.0.0` with
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.trycloudflare.com`;
- use repository-local `.tools/cloudflared`;
- detach both processes; and
- verify public HTML, sculpture JSON, application JavaScript, WLED JavaScript,
  and WLED WASM return HTTP 200 with appropriate content types.

Manually review on a phone or narrow viewport:

- select panels on the near and far sides;
- orbit through angles that previously hid the delete control;
- verify the delete billboard stays visible, camera-facing, and tappable;
- verify non-selected geometry stays grey/60% throughout orbit and animation;
- tap empty background to restore normal rendering; and
- drag empty background to orbit without losing selection.

## Important files

- `web/src/SurfacePlacementController.ts`: gesture priority, background
  click/drag classification, selected-panel gizmo, billboard delete hit target,
  and capability gates.
- `web/src/SphereRenderer.ts`: authoritative focus rendering across LEDs,
  panel decorations, printable mechanics, connectors, wiring, labels,
  authoring surface, and normal-state restoration.
- `web/src/EditorCapabilities.ts`: delete/select capability derivation; do not
  reintroduce scattered manual-mechanics conditionals.
- `web/src/main.ts`: selection status text and callbacks; selection must remain
  view-only.
- `web/src/styles.css`: CSS2D label focus and any HTML delete-billboard styling.
- `web/src/LedMapping.ts`: `LedMappingEntry.panelId` and panel ownership used
  for per-panel LED focus.
- `web/src/WiringPreview.ts`: panel IDs available for route ownership if route
  segmentation is needed for focus rendering.
- `tests/panel-json-editing.test.ts`: current fast editing/capability baseline.
- `tests/manual-rhombicosidodecahedron-e2e.test.ts`: manual golden mapping.

## Non-goals

Do not:

- mutate sculpture JSON on select/deselect;
- change panel poses, IDs, order, metadata, mapping, or wiring;
- mark generated mechanics stale or manual mechanics `requires-review` merely
  because selection changed;
- redesign delete, rotate, or translate semantics beyond the specified visual
  and gesture fixes;
- dim the selected panel or its editor controls;
- implement focus by changing layer visibility;
- treat 60% brightness as 60% opacity;
- recreate materials every animation frame;
- make empty-background drag deselect;
- make authoring-surface clicks deselect instead of add;
- derive printable mechanics from GLB or manual parts;
- modify SCAD, CAD topology, connector allocation, or printable geometry; or
- weaken existing capability gates.

## Completion criteria

This slice is complete when:

- every selected panel has a delete control that stays visible above all
  geometry and faces the camera throughout orbit and zoom;
- the delete control remains correctly hit-testable and capability-gated;
- the selected panel and editor controls retain their normal appearance;
- every non-selected visible scene element is neutral grey at 60% brightness;
- WLED animation and layer settings continue to update correctly while
  focused;
- a stationary empty-background click deselects and restores exact normal
  rendering;
- an empty-background drag orbits without deselecting;
- panel/label/gizmo/surface gestures keep their existing behavior;
- selection remains view-only and does not modify authoritative JSON or
  mechanical status;
- the manual golden fingerprint remains `31291c59`; and
- all fast view/editor tests pass without CAD or OpenSCAD.
