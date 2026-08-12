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

The verifier regenerates OpenSCAD under the ignored build directory, renders
every STL with hard warnings enabled, renders the detail and full assembly
previews, and only then replaces the versioned snapshot. The simulator stages
copies into the ignored web/public generated asset folders.
