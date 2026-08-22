# Structural truss workflow

This page defines the implemented structural input and candidate-graph
contracts and the ordered work that will extend them. The structural route uses
the existing Schema 2 sculpture JSON. It does not add a second panel format or
use a GLB as printable material.

## Implemented input contract

`structuralDesign` is optional. An authored value names:

- material ID, Young's modulus in MPa, yield strength in MPa, and density in
  kg/m^3;
- one panel mass in kg, safety factor, and maximum displacement in mm;
- installed gravity direction, acceleration in m/s^2, and whether to add all
  six world-axis transport cases;
- printable member diameter limits and increment, maximum unsupported
  compression length, bracket offset, and cable clearance in mm;
- modular connector limits: automatic neighbor distance and degree, minimum
  screw anchors per panel side, print-bed dimensions and margin, the reserved
  legacy strut-segment limit, and explicit include/exclude panel-pair overrides;
- panel or individual-anchor supports with constrained X/Y/Z translations; and
- panel-face, named panel-corner, or DIN/DOUT cable-pull forces in newtons.

An empty authoring project cannot contain structural inputs or generated
structural assets. Add at least one authoritative panel pose first.

The runtime parser rejects non-finite or non-positive physical values, safety
factors below 1, zero gravity or force vectors, duplicate IDs, unknown panels,
blocked anchors, and invalid axes, corners, or connector names.
It also rejects duplicate, contradictory, self-referential, or unknown panel
pairs and any segment limit that does not fit the configured print envelope.
Omitted connector settings use named deterministic defaults: two automatic
neighbors, two screw anchors per side, a 250 × 250 × 250 mm print envelope with
5 mm margin, and a retained 220 mm legacy segment limit. Organic connector v1
does not split a body at this limit. It rejects a body that does not fit the
print envelope. The retained value stays validated for Schema 2 compatibility
and is reserved for a later keyed organic split.

## Normalized geometry

The normalizer sorts panels and holes by stable ID. For each panel it copies the
authoritative centre and right-handed basis, then derives the PCB corners and
eligible mounting-hole positions in world millimetres. The profile owns the
PCB size, M2 pilot and lead-in dimensions, blocked holes, and the measured 0.20
mm hole-edge and 0.50 mm surface-flush corrections.

Each eligible anchor ID is `<panel-id>:<hole-id>`. A panel support expands to
all eligible anchors. An individual support must name an eligible hole. The
normalizer does not create an anchor at a DIN/DOUT-blocked hole.

Installed gravity is always one load case. Six transport gravity cases are
added when selected. Explicit face loads use the panel centre. Corner loads use
the exact derived outline corner. Cable loads use the known DIN or DOUT corner;
the current profile warns that exact pad envelopes are not measured.

## Preview assumptions and warnings

When `structuralDesign` is absent, normalization uses explicit PLA-like preview
values from `STRUCTURAL_PREVIEW_DEFAULTS`. These values are not measured facts.
When supports are empty, the first panel in stable ID order becomes the preview
reference panel and all its eligible anchors are fixed. The result includes a
prominent warning that analysis requires real mounting conditions.

Unknown electrical keep-outs produce a separate warning. Later printable
geometry must use the configured conservative cable clearance until measured
DIN, DOUT, V+, and V- envelopes exist.

## Derived output contract

`generatedStructure` identifies one complete validated structural asset set.
It contains a SHA-256 source fingerprint and stable artifact entries for at
least one STL part, an exact-mesh STL preview, a 3MF package, JSON analysis, and
a Markdown engineering report. It cannot coexist with planar generated
mechanics or manually authored mechanics.

The fingerprint includes sorted panel poses, effective structural inputs, PCB
dimensions, mounting holes and fastener facts, physical corrections, connector
facts, and electrical keep-outs. Panel-array and profile-hole storage order do
not change it. Any relevant input change makes the last artifact set stale.

## Candidate truss

`createCandidateTruss()` consumes only `NormalizedStructuralDesign`. It starts
from every eligible anchor, then keeps analytical hubs only at anchors reserved
by a local connector. Panel-rigidity nodes and ties represent PCB/bracket plate
stiffness in the axial model. They are not printable struts and do not add
print mass or member self-weight.

Automatic inter-panel topology is a degree-limited relative-neighborhood
forest with deterministic connectivity repair. Thus, a trail becomes local
P-01–P-02 and P-02–P-03 cells instead of an all-to-all or sculpture-spanning
truss. Authored include/exclude overrides take precedence. Each accepted cell
reserves at least two distinct unused screw anchors on each panel, adds one
offset bracket hub per side, and proposes a triangulated cross-brace between
the two three-node bracket sides. PCB collisions remain rejected diagnostics.

The generator rejects fewer than three non-collinear eligible anchors,
coincident hubs, zero-length or duplicate edges, disconnected panel groups, and
graphs with a member bridge. A whole panel-pair cell can be part of a trail,
but no individual member may be its only load path. Every cell must keep all
two screw anchors and its offset hub engaged after optimization.

## Linear 3D truss analysis

`compileStructuralTrussModel()` maps normalized supports from anchor IDs to
their candidate hubs. Each hub has X, Y, and Z translation. Every circular
candidate member supplies its length, unit direction, area, second moment of
area, Young's modulus, yield strength, and safety factor in the N-mm-MPa unit
system.

Gravity cases include panel mass and candidate-member self-weight. Panel mass
is shared across that panel's hubs and member weight is shared across its two
ends. A face force is shared across all hubs on its panel. A corner or DIN/DOUT
cable force is applied to the nearest eligible hub. This is the rigid bracket-
plate transfer approximation used by the axial model.

`solveLinearTruss()` assembles the standard global axial stiffness matrix,
removes constrained degrees of freedom, and uses one Cholesky factor for every
sorted load case. The relative pivot tolerance is `1e-10` of the largest free
diagonal. A failed pivot reports insufficient support or a rigid-body
mechanism. Each solution must satisfy a relative residual of `1e-8`; bounded
iterative refinement reuses the same factor before numerical failure.

Panel-level supports intentionally constrain the complete rigid-plate model for
that active bracket interface, including connector hubs and the analysis-only
panel-rigidity node. Individual-anchor supports constrain only their exact
printed anchor and must be selected by a connector; otherwise candidate
generation fails. Loads
and panel mass are distributed only through connector anchors that exist in
printable brackets.

Results contain nodal applied force, displacement, and reaction. Each member
gets signed axial force, tension/compression state, stress, safety-factored
yield utilization, pinned-pinned Euler buckling capacity and compression-only
buckling utilization. The maximum of yield and buckling utilization selects
the governing load case, with stable load-case ID as the tie-breaker.

## Load-path and member optimization

`optimizeStructuralTruss()` uses bounded deterministic iterations. “Unloaded”
means that the maximum absolute member force across every selected load case is
below the larger of the absolute floor and relative force threshold. Only
inter-panel candidates can be removed. Long compression candidates are also
removal targets. Panel-local and connector-bracket ties always remain.

The optimizer first tries the complete removal batch. It updates every cell's
retained-member list, validates all bracket-side nodes and redundant local
paths, and solves a copy with every retained diameter at the authored maximum.
If that graph cannot satisfy stress, buckling, and displacement, it restores
the shortest candidates with stable-ID tie-breaking.
This capacity check prevents a graph that is topologically redundant but too
flexible from losing needed load paths.

Diameter sizing rounds up to `memberDiameterIncrementMm`. The effective maximum
is the largest minimum-plus-increment grid value that does not exceed the
authored maximum. Yield utilization scales with area, Euler buckling with the
fourth power of diameter, and global displacement with area. Every changed
diameter changes member mass, so the next iteration recompiles gravity loads.

The objective adds material volume to weighted excess stress, buckling,
displacement, long unsupported compression, fragile attachment, and
unprintable-dimension terms. Connectivity validation makes the fragile term
zero for accepted iterations; diameter rounding normally makes the printable
term zero. The trace keeps the evaluated objective and exact removed or resized
member IDs. A stationary result is `converged` only when all hard limits pass;
otherwise it is `infeasible`. A result that still changes on the last permitted
iteration is `iteration-limit`, even if its current values violate a limit.
Only `converged` is eligible for printable generation.

## Printable Manifold solids

`buildStructuralSolids()` accepts only a converged optimization with the same
source fingerprint. It emits one cap-derived organic body for each local
panel-pair cell. It never joins unrelated cells into one sculpture-sized part.

A connector body starts with broad 13 mm rounded screw shoes derived from the
canonical triangle and pentagon fixture language. It unites exactly its
reserved screw bosses, rear hubs, offset connector hubs, and retained load-path
skeleton. The structural anchor stays at the exact authored hole. The printed pilot
moves 0.20 mm inward from the nearest panel edge, consistent with the measured
hole-edge correction. Printed material starts at the rear PCB surface plus the
measured 0.50 mm flush correction. Boolean cutters create the profile's 1.60 mm
pilots and 3.20 × 0.70 mm lead-ins, 4.20 mm
across-flats M2 pockets and configured cable-clearance bores at DIN/DOUT-blocked
profile holes. A triangular rear mark identifies the first stable side.

The hidden printable skeleton becomes capsules whose radius is the optimized
member radius plus minimum wall. A smooth maximum blends those capsules, and
Manifold `levelSet()` converts the bounded 1.5 mm field into one watertight web.
The grid is limited to 2,000,000 cells before allocation. The resulting body
contains each retained member section, but the axial truss analysis does not
calculate stress in the blended surface. Oversize organic bodies fail the
print-envelope check; keyed organic splitting remains a later task.

Before a mesh leaves the Manifold stage, its kernel status, connected-component
count, volume, bounds, vertices, indices, and triangle areas are checked. Tiny
Boolean fragments below `0.00001 mm^3` are discarded; more than one printable
component is an error. All constructed WASM objects are explicitly released.
The final solid volume of every connector body is also checked against each
nearby oriented PCB envelope. Any intersection stops CAD generation.
Sorted part extents must also fit the configured print-bed dimensions after the
authored margin and an allowed print rotation.

## Exact printable artifacts

`compileStructuralArtifactBundle()` sorts stable part IDs and serializes every
validated mesh as deterministic binary STL. It also concatenates those same
indexed meshes into one world-space assembly-preview STL. It does not retessellate
or rebuild the solids during export.

The print package is a Core 3MF ZIP with the required content-type, root
relationship, and `3D/3dmodel.model` parts. Each structural part is one named
mesh object. The model declares millimetres, and every build item receives the
same translation that moves an arbitrary world-space assembly into the positive
build octant without changing relative panel geometry.

Every artifact has a stable project-relative path, byte length, and SHA-256 in
`structure/artifacts.json`. Compilation reopens STL and 3MF bytes to check
triangle counts, bounds, identities, units, indices, transforms, and package
structure. Publication writes and exact-byte verifies all files in a sibling
staging directory, writes the manifest last, and then swaps the complete
directory. It can replace only one safe direct child of an explicitly supplied
artifact root, and only when the existing child is a complete generator-owned
bundle with no unknown files. If final promotion fails, the prior directory is
restored.

In-memory export has explicit limits: 5,000 parts, 500,000 triangles per part,
and 6,000,000 total triangles or vertices. Inputs above a limit fail before STL
or 3MF allocation with the measured count in the error.

## Headless pipeline and report

Run:

```bash
npm run generate:structure -- --sculpture sculptures/<project>/sculpture.json
```

The optional `--output-root <directory>` and `--directory <safe-name>` flags
select one direct child of the output root. The command resolves the existing
Schema 2 project and panel profile, runs every structural stage, includes the
resolved profile and verified optional design surface at safe paths in the
emitted project, and publishes only after all files and hashes validate.

`structure/analysis.json` contains active printable supports and load cases, units,
input source, warnings, the complete design/material/safety policy, candidate
and connector counts, resolved print envelope, organic body count and mass,
optimization objective and trace, full load-case node/member results,
enriched governing member results, and exact print-artifact hashes.

`structure/report.md` starts and ends with the statement that its results are
load-path guidance and not engineering certification. It makes preview-only
supports and preview material/mass assumptions prominent. It lists unknown
connector geometry, supports, load cases, safety factor, displacements,
equilibrium residuals, tension/compression, stress, utilization, approximate
pinned Euler buckling, governing cases, optimization history, modeling limits,
and print/analysis artifact hashes. The outer `generatedStructure` manifest
records the report's own hash without creating a circular report hash.

## Browser and portable projects

The editor has a separate **Generate structural truss** action. Its modular
connector settings show proposed panel pairs, accept explicit include/exclude
overrides, and edit neighbor and print-envelope limits in the existing Schema
2 `structuralDesign`. It calls the same browser-safe pipeline and loads the exact referenced
assembly-preview STL, and enables downloads only after every structural
artifact passes its hash and format check. The existing planar closure action
remains available as a separate fabrication route.

Folder and ZIP export include every referenced structural STL, the 3MF package,
analysis JSON, report, and a bundled resolved panel profile. Import uses that
profile before a staged catalog fallback and verifies every structural artifact
before it creates preview URLs. A panel or structural-input edit makes the
stored fingerprint stale. Stale or failed structure is hidden, but editing,
simulation, mapping, wiring, and JSON save continue.

### Quick UI trial

Run `npm run dev:web`, open the shown local URL, and select **Structural
Three-panel Spatial Trail**. The project contains three nearby spatial panels,
one authored bench support, and face, corner, and cable-pull loads. The settings
show two local cells and no first-to-third shortcut. Select **Generate
structural truss**. The browser
shows the exact assembly-preview STL and enables **Download structural files**
and portable project export after validation.

The trial values are not measured mounting evidence. Replace the bench support,
material, mass, and loads before physical use. The generated report is
load-path guidance, not engineering certification.
