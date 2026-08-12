# Project instructions

This repository contains 3D-printable connectors and fillers for a
rhombicosidodecahedron LED sculpture.

## Source-of-truth rules

- Modify the canonical files under `parts/`; never create `v2`, `v3`, or other
  version-numbered copies. Git provides the version history.
- Treat generated STL and PNG files as build artifacts, not source.
- Preserve comments that document physical print tests and fit corrections.
- Make small, reviewable geometry changes and describe the mechanical intent.

## Physical PCB

- PCB dimensions: 66 x 65 mm
- PCB thickness: 0.8 mm
- Corner-hole centres: 8 mm from the PCB edge
- Middle hole on the 66 mm edge: 25 mm from an outer hole
- M2 screws
- Plastic pilot diameter: 1.6 mm
- Screw lead-in: 3.2 mm diameter, 0.7 mm deep

## Critical design constraints

- Never change the proven polyhedron panel angles unless explicitly requested.
- No printable material may intersect PCB preview/envelope volumes.
- DIN, DOUT, V+, and V- connector corners must remain unobstructed.
- Outside filler surfaces must remain printable flat on the bed.
- Centre-panel structures must not cross the pentagon boundary.
- Preserve the physically tested 0.20 mm hole-edge correction and 0.50 mm
  surface-flush correction unless a new physical test justifies a change.
- Prefer rounded screw tabs matching the established connector language.
- Keep the triangle handedness that moves tabs away from electrical pads.

## Verification

After a geometry change:

1. Render every changed printable part with OpenSCAD.
2. Inspect the part in assembly mode when the source provides it.
3. Confirm screw-hole centres, PCB positions, panel angles, and connector
   clearances did not move unless the task explicitly requires that movement.
4. Report when OpenSCAD is unavailable; never claim a successful render based
   only on a static inspection.

## Phone preview tunnels

- Use the checked-in launcher from the repository root:

  ```bash
  npm run preview:phone
  ```

  It reuses a healthy repository preview when one exists; otherwise it chooses
  the first available port at or above 4175 and starts Vite and the
  repository-local Cloudflare quick tunnel as detached processes. It verifies the
  required public endpoints and content types, and prints the review URL. Pass a
  preferred starting port with `npm run preview:phone -- 4185`.
- For phone-accessible simulator previews, use the repository-local `.tools/cloudflared` quick tunnel instead of returning a `localhost` URL.
- Start Vite on `0.0.0.0` with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.trycloudflare.com`; do not set Vite `allowedHosts` to `true`.
- Run both Vite and `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:<port>` as detached processes so the tunnel survives the agent turn boundary.
- Before handing off the URL, verify the public HTML, sculpture JSON, JavaScript, and WLED WASM endpoints all return HTTP 200 with appropriate content types.
- Quick tunnels are temporary and have no uptime guarantee; describe them as review links, not deployments.
