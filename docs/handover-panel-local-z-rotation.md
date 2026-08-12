# Handover: rotate a selected panel around local Z

This is the next focused editor task after commits `4816f34` and `9572779`
on `refactor/sculpture-json-pipeline`. Start from the latest remote branch and
read [AGENTS.md](../AGENTS.md),
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md),
and [Pose-first sculpture schema](pose-first-schema.md) before changing code.

## Requested behavior

Let the user rotate the selected panel in its own plane, around the panel's
local Z axis. In the pose contract, local Z is
`panels[].pose.orientation.normal`. Rotation must change only the in-plane
`xAxis` and `yAxis`; it must not change the panel center, outward normal,
normal offset, attachment triangle, or proven polyhedron face angles.

This is manual rotation only. Do not add automatic orientation or panel
distribution.

## Pose math

For a right-handed basis `(xAxis, yAxis, normal)` and signed angle `theta`:

```text
x' = cos(theta) * xAxis + sin(theta) * yAxis
y' = -sin(theta) * xAxis + cos(theta) * yAxis
normal' = normal
```

This convention is a positive rotation from local X toward local Y when viewed
from outside along the normal. Confirm the UI's clockwise/counter-clockwise
labels against the camera-facing user view rather than relying only on the
formula's sign.

Renormalize the result and preserve a right-handed orthonormal frame. Avoid
Euler angles in saved JSON; the source of truth remains the explicit basis.

## Recommended interaction

Add compact rotation controls near the selected-panel status:

- rotate counter-clockwise by a fixed step;
- rotate clockwise by the same step; and
- show the accumulated or derived in-plane angle when useful.

A 90-degree step is the most important first path for the 66 x 65 mm PCB
because swapping which local dimension follows a square edge is mechanically
meaningful. A smaller step such as 1 or 5 degrees may be added only if the UI
stays clear. Do not silently snap arbitrary existing poses.

Disable the controls when no panel is selected. Rotation should not require a
new surface click and should not move the camera.

## Suggested implementation seam

Add a pure editor operation in `src/sculpture/SculptureEditor.ts`, for example:

```ts
rotatePanelAroundLocalZ(
  source: PanelAssemblyDefinition,
  panelId: string,
  degrees: number,
): PanelAssemblyDefinition
```

It should:

1. clone the definition;
2. find the selected panel or throw an actionable unknown-panel error;
3. rotate and normalize only `xAxis` and `yAxis`;
4. preserve `position`, `normal`, and `surfaceAttachment` byte-for-byte;
5. call `preserveAuthoringBoundary` before invalidating derived mechanics;
6. set `mechanicalShell.derivationStatus` to
   `requires-regeneration`;
7. set transform/orientation/physical-chain calibration back to provisional as
   current move operations do;
8. append a concise note only if that matches existing edit behavior; and
9. return a definition that passes the runtime parser after JSON round-trip.

Wire the control in `web/src/main.ts` through
`createPanelAssemblyProject()`, `createLoadedSculpture()`, and
`applyLoadedSculpture()` so LEDs and provisional wiring update immediately,
the selected panel remains selected, and stale mechanical previews disappear.

## Important existing behavior

- A newly added JSON-shell panel is initially aligned to the shortest edge of
  its clicked triangle, avoiding a quad's triangulation diagonal.
- Dragging a panel projects its previous X axis onto the new surface, so an
  existing local-Z rotation should naturally survive a drag. Add a regression
  test for this expectation if controller logic changes.
- `regenerateMechanicalShell()` validates the full rotated 66 x 65 mm
  rectangle plus configured clearance against a containing planar face.
- The empty 66 mm cuboctahedron has zero envelope clearance because the 66 mm
  PCB axis exactly matches the square. Centered 0-degree and 90-degree
  orientations can fit; most intermediate angles must be rejected by Run.
  That rejection is correct and should name the panel and boundary rule.
- Rotating a panel changes every world-space LED, mounting-hole, DIN/DOUT, and
  connector position because those derive from the pose axes. Do not rotate
  visual geometry alone.
- A GLB remains a canvas only. Rotation must not create a mechanical
  association from GLB triangles or export GLB geometry.
- CAD remains blocked until regeneration succeeds.
- Preserve the 0.20 mm hole-edge correction, 0.50 mm surface-flush correction,
  M2 pilot/lead-in dimensions, real-hole selection, and DIN/DOUT keep-outs.
- Do not change established panel normals or polyhedron angles.

## Tests to add

At minimum, cover:

1. +90 then -90 degrees restores the original orientation within tolerance.
2. Four +90-degree rotations restore the original serialized pose within a
   sensible floating-point tolerance.
3. Position, normal, surface attachment, ID, profile, and wiring count do not
   change during rotation.
4. The result is right-handed and orthonormal and survives JSON parse/reload.
5. Rotation marks mechanics stale and hides mechanical previews.
6. Mapping LEDs, mounting holes after regeneration, and DIN/DOUT locations
   rotate with the panel axes.
7. The centered empty-cuboctahedron panel regenerates at supported 0/90-degree
   orientations.
8. An unsafe intermediate angle or off-center rotation is rejected with the
   panel ID and envelope/boundary guidance.
9. Selection remains on the rotated panel and provisional wiring is unchanged.
10. Existing sculpture byte-equivalence remains unchanged when no rotation is
    performed.

Run:

```bash
npm test
npx tsc -b
npx vite build
npm run verify:cad
npm run verify:processed-sculptures
```

Also generate a six-panel empty-cuboctahedron editor result and run
`npm run verify:sculpture -- --sculpture <generated-json> --ephemeral` so all
eight regenerated closure STLs and both previews are rendered by OpenSCAD.

## Completion criteria

The slice is complete when local-Z rotation is saved in authoritative JSON,
immediately reflected in LEDs and wiring, mechanically revalidated on Run,
rejected when unsafe, and proven not to alter unaffected sculpture output.
Commit and push the result to `refactor/sculpture-json-pipeline`.
