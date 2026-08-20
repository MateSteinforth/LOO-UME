import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { deletePanel } from "../src/sculpture/SculptureEditor.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function loadManual(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/rhombicosidodecahedron/sculpture.json", "utf8",
  )));
}

function projectFor(
  definition: PanelAssemblyDefinition,
  panelProfileInput?: unknown,
) {
  const project = createPanelAssemblyProject(
    definition,
    "sculptures/rhombicosidodecahedron/sculpture.json",
    panelProfileInput,
  );
  return { project, mapping: createPanelAssemblyMapping(project) };
}

function proof() {
  return {
    kind: "proof-010-hardware-verification" as const,
    taskId: "PROOF-010" as const,
    status: "passed" as const,
    deploymentIdentity: "a".repeat(64),
    deviceReadbackSha256: "b".repeat(64),
    asBuiltRecordSha256: "c".repeat(64),
    parityProofSha256: "d".repeat(64),
  };
}

async function authoredManual(): Promise<PanelAssemblyDefinition> {
  const definition = await loadManual();
  const { project, mapping } = projectFor(definition);
  const draft = createProvisionalWiringPreview(
    mapping, definition, project.panelProfile,
  );
  for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
    definition.wiring.outputs[index]!.panelIds = [
      ...draft.outputs[index]!.panelIds,
    ];
  }
  definition.wiring.status = "authored";
  return definition;
}

describe("Schema 2 wiring lifecycle", () => {
  it("derives legacy provisional routes as draft without rewriting them", async () => {
    const definition = await loadManual();
    definition.wiring.status = "provisional";
    delete definition.wiring.routeRevision;
    for (const output of definition.wiring.outputs) delete output.panelIds;
    const { project, mapping } = projectFor(definition);
    const preview = createProvisionalWiringPreview(
      mapping, definition, project.panelProfile,
    );

    expect(definition.wiring.status).toBe("provisional");
    expect(preview.status).toBe("draft");
  });

  it("preserves stale route evidence and uses a labelled temporary route after a panel-set edit", async () => {
    const authored = await authoredManual();
    const originalRoutes = structuredClone(authored.wiring.outputs);
    const stale = deletePanel(authored, authored.panels[0]!.id);
    const { project, mapping } = projectFor(stale);
    const preview = createProvisionalWiringPreview(
      mapping, stale, project.panelProfile,
    );

    expect(stale.wiring.status).toBe("requires-review");
    expect(stale.wiring.outputs).toEqual(originalRoutes);
    expect(preview.status).toBe("requires-review");
    expect(preview.routeSource).toBe("temporary-draft-suggestion");
    expect(preview.savedOutputPanelIds).toEqual(
      originalRoutes.map((output) => ({
        outputIndex: output.outputIndex,
        panelIds: output.panelIds,
      })),
    );
    expect(preview.outputs.flatMap((output) => output.panelIds)).toHaveLength(40);
    expect(preview.notes[0]).toContain("no longer matches the panel set");
    expect(() => parsePanelAssemblyDefinition(stale)).not.toThrow();
  });

  it("rejects structural corruption in a requires-review route", async () => {
    const definition = await authoredManual();
    const { project, mapping } = projectFor(definition);
    definition.wiring.status = "requires-review";
    definition.wiring.outputs[0]!.panelIds![1] =
      definition.wiring.outputs[0]!.panelIds![0]!;

    expect(() => createProvisionalWiringPreview(
      mapping, definition, project.panelProfile,
    )).toThrow(/cannot repeat/);
  });

  it("requires a measured controller for measured wiring and PROOF-010 receipt for hardware verification", async () => {
    const definition = await authoredManual();
    definition.wiring.status = "measured";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /measured controller/,
    );

    definition.wiring.controller.status = "measured";
    expect(() => parsePanelAssemblyDefinition(definition)).not.toThrow();

    definition.wiring.status = "hardware-verified";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(/PROOF-010/);

    definition.wiring.hardwareProof = proof();
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /accepted PROOF-010 validation/,
    );
    const { project, mapping } = projectFor(await authoredManual());
    expect(() => createProvisionalWiringPreview(
      mapping, definition, project.panelProfile,
    )).toThrow(/accepted PROOF-010 validation/);

    definition.wiring.hardwareProof.parityProofSha256 = "invalid";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(/proof records/);
  });

  it("treats measured wiring as readiness-capable and keeps hardware proof separate", async () => {
    const definition = await authoredManual();
    definition.status = "measured";
    definition.wiring.status = "measured";
    definition.wiring.controller.status = "measured";
    definition.wiring.outputs.forEach((output, index) => {
      output.gpio = index + 1;
    });
    definition.calibration = {
      panelTransforms: "measured",
      installedPanelOrientation: "measured",
      panelPixelOrder: "measured",
      physicalChains: "measured",
    };
    definition.panels.forEach((panel) => {
      panel.rotationDegrees = 0;
      panel.mirrored = false;
      panel.installedAddressTransform = {
        status: "measured",
        referenceView: "back",
        quarterTurnsClockwise: 0,
        mirrored: false,
      };
    });

    const { project: draftProfileProject } = projectFor(definition);
    const measuredProfile = structuredClone(draftProfileProject.panelProfile);
    measuredProfile.pixelGrid.provisionalOrder.status = "measured";
    const { project, mapping } = projectFor(definition, measuredProfile);
    const wiring = createProvisionalWiringPreview(
      mapping, definition, project.panelProfile,
    );
    const contract = createHardwareMappingContract(
      mapping, wiring, project.panelProfile,
    );

    expect(contract.readiness).toMatchObject({
      ready: false,
      currentChecksPass: true,
      wiringLifecycle: "measured",
    });
    expect(contract.mapping.panels.every(
      (panel) => panel.wiring.status === "assigned",
    )).toBe(true);

    definition.wiring.status = "requires-review";
    definition.wiring.hardwareProof = proof();
    const staleVerified = deletePanel(
      definition, definition.panels[0]!.id,
    );
    expect(staleVerified.wiring).toMatchObject({
      status: "requires-review",
      hardwareProof: proof(),
    });
    expect(() => parsePanelAssemblyDefinition(staleVerified)).not.toThrow();
  });
});
