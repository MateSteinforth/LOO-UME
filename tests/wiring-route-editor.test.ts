import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { deletePanel } from "../src/sculpture/SculptureEditor.ts";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import {
  confirmWiringRouteEditorModel,
  copyDraftSuggestionToRouteEditor,
  createWiringRouteEditorModel,
  moveRoutePanelToOutput,
  moveRoutePanelToPosition,
  moveRoutePanelWithinOutput,
  validateWiringRouteEditorModel,
} from "../web/src/WiringRouteEditor.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function loadDefinition(path: string): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
}

function previewFor(definition: PanelAssemblyDefinition, source: string) {
  const project = createPanelAssemblyProject(definition, source);
  const mapping = createPanelAssemblyMapping(project);
  return createProvisionalWiringPreview(mapping, definition, project.panelProfile);
}

describe("browser wiring route editor model", () => {
  it("requires explicit draft editing, then persists an authored revision and exact order", async () => {
    const source = "sculptures/pose-only-two-panel/sculpture.json";
    const definition = await loadDefinition(source);
    const preview = previewFor(definition, source);
    const model = createWiringRouteEditorModel(definition, preview);
    expect(model?.source).toBe("draft-suggestion");
    expect(validateWiringRouteEditorModel(definition, model)).toMatchObject({
      valid: false,
      errors: ["Choose Edit suggested route before saving an authored route."],
    });

    const copied = copyDraftSuggestionToRouteEditor(model!);
    const firstPanelId = copied.outputs[0]!.panelIds[0]!;
    const reordered = moveRoutePanelWithinOutput(
      copied, 0, firstPanelId, 1,
    );
    expect(validateWiringRouteEditorModel(definition, reordered)).toEqual({
      valid: true,
      errors: [],
    });

    const confirmed = confirmWiringRouteEditorModel(definition, reordered);
    expect(confirmed.wiring).toMatchObject({
      status: "authored",
      routeRevision: 1,
      chainLengths: [2],
      outputs: [{ panelIds: reordered.outputs[0]!.panelIds }],
    });
    expect(confirmed.calibration.physicalChains).toBe("provisional");
    expect(confirmed.calibration.installedPanelOrientation).toBe("provisional");
    expect(confirmed.panels.every((panel) =>
      panel.installedAddressTransform === undefined ||
      (panel.installedAddressTransform.selectionMethod === "manual" &&
        panel.installedAddressTransform.optimizationFingerprint === undefined)
    )).toBe(true);
    expect(confirmed.wiring.outputs[0]).toMatchObject({
      outputIndex: definition.wiring.outputs[0]!.outputIndex,
      gpio: definition.wiring.outputs[0]!.gpio,
    });
    expect(() => parsePanelAssemblyDefinition(confirmed)).not.toThrow();

    const confirmedProject = createPanelAssemblyProject(confirmed, source);
    const confirmedMapping = createPanelAssemblyMapping(confirmedProject);
    const confirmedPreview = createProvisionalWiringPreview(
      confirmedMapping, confirmed, confirmedProject.panelProfile,
    );
    const confirmedContract = createHardwareMappingContract(
      confirmedMapping, confirmedPreview, confirmedProject.panelProfile,
    );
    expect(confirmedContract.outputs[0]!.panelIds).toEqual(
      reordered.outputs[0]!.panelIds,
    );
    expect(confirmedContract.mapping.panels.find(
      (panel) => panel.id === reordered.outputs[0]!.panelIds[0],
    )?.wiring).toMatchObject({ output: 0, chainPosition: 0 });
    expect(validateLedmapEquivalence(
      confirmedContract.mapping, confirmedContract.ledmap,
    )).toEqual([]);

    const invalidRevision = structuredClone(confirmed);
    invalidRevision.wiring.routeRevision = 0;
    expect(() => parsePanelAssemblyDefinition(invalidRevision)).toThrow(
      /revision must be an integer/,
    );

    const draftWithRevision = structuredClone(definition);
    draftWithRevision.wiring.routeRevision = 1;
    expect(() => parsePanelAssemblyDefinition(draftWithRevision)).toThrow(
      /Draft wiring cannot contain an authored route, route revision, or proof/,
    );

    const laterEdit = deletePanel(confirmed, confirmed.panels[0]!.id);
    expect(laterEdit.wiring.status).toBe("requires-review");
    expect(laterEdit.wiring.routeRevision).toBe(1);
    expect(laterEdit.wiring.outputs).toEqual(confirmed.wiring.outputs);
  });

  it("clears stale proof and advances revisions without retaining measurement approval", async () => {
    const source = "sculptures/pose-only-two-panel/sculpture.json";
    const definition = await loadDefinition(source);
    const copied = copyDraftSuggestionToRouteEditor(
      createWiringRouteEditorModel(definition, previewFor(definition, source))!,
    );
    const revisionOne = confirmWiringRouteEditorModel(definition, copied);
    const requiresReview = structuredClone(revisionOne);
    requiresReview.wiring.status = "requires-review";
    requiresReview.wiring.hardwareProof = {
      kind: "proof-010-hardware-verification",
      taskId: "PROOF-010",
      status: "passed",
      deploymentIdentity: "a".repeat(64),
      deviceReadbackSha256: "b".repeat(64),
      asBuiltRecordSha256: "c".repeat(64),
      parityProofSha256: "d".repeat(64),
    };
    const reviewedModel = createWiringRouteEditorModel(
      requiresReview,
      previewFor(requiresReview, source),
    )!;
    const revisionTwo = confirmWiringRouteEditorModel(
      requiresReview,
      reviewedModel,
    );
    expect(revisionTwo.wiring.status).toBe("authored");
    expect(revisionTwo.wiring.routeRevision).toBe(2);
    expect(revisionTwo.wiring.hardwareProof).toBeUndefined();
    expect(revisionTwo.calibration.physicalChains).toBe("provisional");

    const measured = structuredClone(revisionTwo);
    measured.wiring.status = "measured";
    measured.wiring.controller.status = "measured";
    measured.calibration.physicalChains = "measured";
    const measuredModel = createWiringRouteEditorModel(
      measured,
      previewFor(measured, source),
    )!;
    const revisionThree = confirmWiringRouteEditorModel(measured, measuredModel);
    expect(revisionThree.wiring.status).toBe("authored");
    expect(revisionThree.wiring.routeRevision).toBe(3);
    expect(revisionThree.calibration.physicalChains).toBe("provisional");
  });

  it("allows output assignment changes and derives the new chain lengths", async () => {
    const source = "sculptures/rhombicosidodecahedron/sculpture.json";
    const definition = await loadDefinition(source);
    const preview = previewFor(definition, source);
    const copied = copyDraftSuggestionToRouteEditor(
      createWiringRouteEditorModel(definition, preview)!,
    );
    const movedPanelId = copied.outputs[0]!.panelIds[0]!;
    const reassigned = moveRoutePanelToOutput(copied, movedPanelId, 1);
    expect(validateWiringRouteEditorModel(definition, reassigned)).toEqual({
      valid: true,
      errors: [],
    });

    const confirmed = confirmWiringRouteEditorModel(definition, reassigned);
    expect(confirmed.wiring.chainLengths).toEqual([10, 11, 10, 10]);
    expect(confirmed.wiring.outputs[1]!.panelIds).toContain(movedPanelId);
    expect(() => parsePanelAssemblyDefinition(confirmed)).not.toThrow();

    const tampered = structuredClone(reassigned);
    tampered.outputs[0]!.outputIndex = 9;
    expect(validateWiringRouteEditorModel(definition, tampered)).toMatchObject({
      valid: false,
    });
    expect(validateWiringRouteEditorModel(definition, tampered).errors).toContain(
      "Output 1 is missing or out of order.",
    );
  });

  it("moves panels to drag positions and rejects edits to an uncopied draft", async () => {
    const draftSource = "sculptures/pose-only-two-panel/sculpture.json";
    const draftDefinition = await loadDefinition(draftSource);
    const draft = createWiringRouteEditorModel(
      draftDefinition,
      previewFor(draftDefinition, draftSource),
    )!;
    const draftPanelId = draft.outputs[0]!.panelIds[0]!;
    expect(() => moveRoutePanelToPosition(draft, draftPanelId, 0, 2)).toThrow(
      /Edit the suggested route/,
    );

    const source = "sculptures/rhombicosidodecahedron/sculpture.json";
    const definition = await loadDefinition(source);
    const editable = createWiringRouteEditorModel(
      definition,
      previewFor(definition, source),
    )!;
    const panelId = editable.outputs[0]!.panelIds[0]!;
    const sameOutput = moveRoutePanelToPosition(editable, panelId, 0, 2);
    expect(sameOutput.outputs[0]!.panelIds[1]).toBe(panelId);
    const destination = sameOutput.outputs[1]!;
    const movedAcross = moveRoutePanelToPosition(
      sameOutput,
      panelId,
      destination.outputIndex,
      0,
    );
    expect(movedAcross.outputs[1]!.panelIds[0]).toBe(panelId);
    expect(movedAcross.outputs[0]!.panelIds).not.toContain(panelId);
    expect(editable.outputs[0]!.panelIds[0]).toBe(panelId);
  });

  it("starts a stale requires-review route from its temporary suggestion", async () => {
    const source = "sculptures/pose-only-two-panel/sculpture.json";
    const definition = await loadDefinition(source);
    const draft = previewFor(definition, source);
    for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
      definition.wiring.outputs[index]!.panelIds = [...draft.outputs[index]!.panelIds];
    }
    definition.wiring.status = "authored";
    const stale = deletePanel(definition, definition.panels[0]!.id);
    const preview = previewFor(stale, source);
    const model = createWiringRouteEditorModel(stale, preview);

    expect(preview).toMatchObject({
      status: "requires-review",
      routeSource: "temporary-draft-suggestion",
      savedOutputPanelIds: [{ outputIndex: 0 }],
    });
    expect(model).toMatchObject({
      source: "temporary-draft-suggestion",
      copiedDraftSuggestion: false,
      outputs: [{ panelIds: [stale.panels[0]!.id] }],
    });
  });
});
