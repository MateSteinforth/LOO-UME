# Generated sculpture artifacts

These folders are versioned snapshots produced from the sculpture JSON files.
They are build artifacts, not hand-authored CAD source.

Each processed sculpture has this layout:

~~~text
artifacts/sculptures/<sculpture-id>/
|-- manifest.json
|-- 3d/
|   `-- closure-*.stl
`-- previews/
    |-- assembly.png
    `-- closure-detail.png
~~~

Refresh all snapshots with:

~~~bash
npm run verify:processed-sculptures
~~~

On Codex, the verifier regenerates OpenSCAD under the ignored build directory
and renders every STL. This Grok line does not run that OpenSCAD verifier.
Generic panel-outline parts compile with Manifold. The simulator stages copies
into the ignored web/public generated asset folders.
