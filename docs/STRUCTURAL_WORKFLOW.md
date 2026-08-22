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
- panel or individual-anchor supports with constrained X/Y/Z translations; and
- panel-face, named panel-corner, or DIN/DOUT cable-pull forces in newtons.

An empty authoring project cannot contain structural inputs or generated
structural assets. Add at least one authoritative panel pose first.

The runtime parser rejects non-finite or non-positive physical values, safety
factors below 1, zero gravity or force vectors, duplicate IDs, unknown panels,
blocked anchors, and invalid axes, corners, or connector names.

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

`createCandidateTruss()` consumes only `NormalizedStructuralDesign`. It puts a
stable bracket at every eligible anchor and offsets a structural hub behind
that anchor by `bracketOffsetMm`. It joins all hubs on one panel with local
ties. This local complete graph represents a rigid bracket plate for the later
axial-truss model without adding a new panel pose.

Inter-panel candidates connect hub pairs in stable ID order. The current named
policy limits candidate length to twice
`maximumUnsupportedCompressionLengthMm`. A member is rejected if its closed
segment intersects any panel PCB oriented box expanded by at least 0.50 mm.
Rejected length and collision candidates are kept as diagnostics.

The generator rejects fewer than three non-collinear eligible anchors,
coincident hubs, zero-length or duplicate edges, disconnected panel groups, and
graphs with a bridge. A bridge means that one member is the only remaining
path. Thus, every accepted candidate graph has at least two graph paths around
each structural member. This is candidate redundancy only; the optimizer must
preserve it when it removes members.

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
mechanism. Each solution must satisfy a relative residual of `1e-8`.

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
removal targets. Panel-local ties always remain.

The optimizer first tries the complete removal batch. It validates connected,
bridge-free attachments and solves a copy with every retained diameter at the
authored maximum. If that graph cannot satisfy stress, buckling, and
displacement, it restores the shortest candidates with stable-ID tie-breaking.
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

## Remaining ordered implementation

`TRUSS-015` through `TRUSS-018` add Manifold parts, STL/3MF export, reports, and
browser portable-project integration. Every report must state that the
analysis gives load-path guidance and is not engineering certification.
