import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";

export interface EditorCapabilities {
  canSelectPanels: boolean;
  canRotateSelectedPanel: boolean;
  canDeleteSelectedPanel: boolean;
  canTranslateOnActiveSurface: boolean;
  canTranslateInPanelPlane: boolean;
  canCreateOnActiveSurface: boolean;
  canAutomaticallySeed: boolean;
  canExportMappingAndWiring: boolean;
  canGenerateGenericMechanics: boolean;
  manualMechanicsRequiresReview: boolean;
}

export function deriveEditorCapabilities(
  definition: PanelAssemblyDefinition,
  hasActiveSurface: boolean,
  pipelineAvailable = true,
): EditorCapabilities {
  const hasPanels = definition.panels.length > 0;
  const usesManualMechanics = definition.manualMechanics !== undefined;
  const hasGenericGenerationInput =
    definition.mechanicalShell !== undefined && definition.closures !== undefined;
  const hasPanelBoundaryInput = definition.boundaryTopology !== undefined;
  return {
    canSelectPanels: hasPanels,
    canRotateSelectedPanel: hasPanels,
    canDeleteSelectedPanel: hasPanels,
    canTranslateOnActiveSurface: hasPanels && hasActiveSurface,
    canTranslateInPanelPlane: hasPanels && !hasActiveSurface,
    canCreateOnActiveSurface: hasActiveSurface && !usesManualMechanics,
    canAutomaticallySeed: hasActiveSurface && !usesManualMechanics,
    canExportMappingAndWiring: true,
    canGenerateGenericMechanics:
      !usesManualMechanics &&
      (hasPanelBoundaryInput ||
        (pipelineAvailable && hasGenericGenerationInput)),
    manualMechanicsRequiresReview:
      definition.manualMechanics?.compatibilityStatus === "requires-review",
  };
}
