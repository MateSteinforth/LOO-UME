import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";
import {
  supportsRectangularPanelFabrication,
  supportsRectangularPanelTools,
} from "../../src/sculpture/PanelCarrier.ts";

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
  canGenerateStructuralMechanics: boolean;
}

export function deriveEditorCapabilities(
  definition: PanelAssemblyDefinition,
  hasActiveSurface: boolean,
  _pipelineAvailable = true,
  profile?: PanelHardwareProfile,
): EditorCapabilities {
  const hasPanels = definition.panels.length > 0;
  const hasGenericGenerationInput =
    definition.mechanicalShell !== undefined && definition.closures !== undefined;
  const hasPanelBoundaryInput = definition.boundaryTopology !== undefined;
  const rectangularTools = profile
    ? supportsRectangularPanelTools(profile)
    : true;
  const rectangularFabrication = profile
    ? supportsRectangularPanelFabrication(profile)
    : true;
  return {
    canSelectPanels: hasPanels,
    canRotateSelectedPanel: hasPanels,
    canDeleteSelectedPanel: hasPanels,
    canTranslateOnActiveSurface: hasPanels && hasActiveSurface,
    canTranslateInPanelPlane: hasPanels && !hasActiveSurface,
    canCreateOnActiveSurface: hasActiveSurface && rectangularTools,
    canAutomaticallySeed: hasActiveSurface && rectangularTools,
    canExportMappingAndWiring: true,
    canGenerateGenericMechanics:
      rectangularFabrication &&
      (hasPanels || hasPanelBoundaryInput || hasGenericGenerationInput),
    canGenerateStructuralMechanics: rectangularFabrication && hasPanels,
  };
}
