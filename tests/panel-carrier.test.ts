import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validatePanelCarrier,
  normalizePanelCarrier,
  supportsRectangularPanelTools,
} from "../src/sculpture/PanelCarrier.ts";
import { parsePanelHardwareProfile } from "../src/sculpture/Definition.ts";
import {
  createPanelAssemblyProject,
  createPanelAssemblyMapping,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { generateClosedPanelBoundary } from "../src/sculpture/PanelOutlineBoundary.ts";
import { preflightPanelBoundaryParts } from "../src/cad/CompilePanelBoundaryBundle.ts";
import { runStructuralPipeline } from "../src/structure/StructuralPipeline.ts";
import { createLocalPanelCarrierGeometry } from "../web/src/PanelCarrierGeometry.ts";
import { deriveEditorCapabilities } from "../web/src/EditorCapabilities.ts";
import { createGeneratedMechanicsFingerprint } from "../src/sculpture/GeneratedMechanics.ts";
import { createStructuralFingerprint } from "../src/sculpture/StructuralDesign.ts";
import { normalizeStructuralDesign } from "../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss } from "../src/structure/CandidateTruss.ts";
import { buildStructuralRibbonSolids } from "../src/cad/GenerateStructuralSolids.ts";

const BASE_PROFILE = JSON.parse(readFileSync(
  "catalog/panels/ws2812b-8x8-66x65.json",
  "utf8",
));
const THREE_PANEL_SOURCE =
  "sculptures/structural-three-panel-trail/sculpture.json";

function planarProfile() {
  const input = structuredClone(BASE_PROFILE);
  input.id = "test-planar-hexagonal-carrier";
  input.carrier = {
    kind: "planar-outline",
    outline: [
      [-28, -18], [0, -30], [28, -18],
      [28, 18], [0, 30], [-28, 18],
    ],
  };
  return parsePanelHardwareProfile(input);
}

function ringProfile() {
  const input = structuredClone(BASE_PROFILE);
  input.id = "test-flexible-ring-1x12";
  input.dimensions = { width: 320, height: 320, thickness: 1 };
  input.carrier = {
    kind: "flexible-path",
    path: Array.from({ length: 12 }, (_, index) => {
      const radians = -index * Math.PI / 6;
      return [Math.cos(radians) * 150, Math.sin(radians) * 150, 0];
    }),
    closed: true,
    width: 10,
    thickness: 1,
  };
  input.pixelGrid.columns = 12;
  input.pixelGrid.rows = 1;
  input.pixelGrid.localEmitterPositions = structuredClone(input.carrier.path);
  input.dataConnectors.doutCorner = "top-left";
  input.dataConnectors.localPositions = {
    coordinateFrame: "pose-local",
    din: input.carrier.path[0],
    dout: input.carrier.path[11],
  };
  const oldDout = input.mounting.holes.find(
    (hole: { id: string }) => hole.id === "bottom-left",
  );
  oldDout.mechanicalUse = "eligible";
  delete oldDout.blockedBy;
  const newDout = input.mounting.holes.find(
    (hole: { id: string }) => hole.id === "top-left",
  );
  newDout.mechanicalUse = "blocked";
  newDout.blockedBy = "DOUT";
  input.power.worstCaseCurrentPerPanel = 0.72;
  return parsePanelHardwareProfile(input);
}

function projectWith(profile: ReturnType<typeof ringProfile>) {
  const definition = parsePanelAssemblyDefinition(JSON.parse(readFileSync(
    THREE_PANEL_SOURCE,
    "utf8",
  )));
  definition.panelProfile = {
    id: profile.id,
    source: `catalog/panels/${profile.id}.json`,
  };
  return createPanelAssemblyProject(definition, THREE_PANEL_SOURCE, profile);
}

describe("generalized panel carriers", () => {
  it("normalizes a legacy profile to the rigid rectangular carrier", () => {
    const profile = parsePanelHardwareProfile(BASE_PROFILE);
    expect(normalizePanelCarrier(profile)).toEqual({ kind: "rectangular" });
    expect(supportsRectangularPanelTools(profile)).toBe(true);
    const geometry = createLocalPanelCarrierGeometry(profile);
    expect(geometry.triangles).toHaveLength(6);
    expect(geometry.outlineSegments).toHaveLength(4);
  });

  it("triangulates an arbitrary simple planar carrier", () => {
    const profile = planarProfile();
    const reparsed = parsePanelHardwareProfile(JSON.parse(JSON.stringify(profile)));
    const geometry = createLocalPanelCarrierGeometry(profile);
    expect(reparsed.carrier).toEqual(profile.carrier);
    expect(profile.carrier?.kind).toBe("planar-outline");
    expect(geometry.triangles).toHaveLength(12);
    expect(geometry.outlineSegments).toHaveLength(6);
    expect(supportsRectangularPanelTools(profile)).toBe(false);
  });

  it("renders a closed 1x12 flexible ring as bounded ribbon segments", () => {
    const profile = ringProfile();
    const geometry = createLocalPanelCarrierGeometry(profile);
    expect(profile.pixelGrid.localEmitterPositions).toHaveLength(12);
    expect(geometry.triangles).toHaveLength(12 * 12 * 3);
    expect(geometry.outlineSegments).toHaveLength(12);
    expect(Math.max(...geometry.triangles.flatMap((point) =>
      point.map((coordinate) => Math.abs(coordinate))
    ))).toBeLessThanOrEqual(160);
  });

  it("uses the rendered segment frame for three-dimensional path bounds", () => {
    const carrier = {
      kind: "flexible-path" as const,
      path: [[0, 0, -40], [0, 0, 40]] as Array<[number, number, number]>,
      closed: false,
      width: 2,
      thickness: 30,
    };
    expect(() => validatePanelCarrier(carrier, {
      width: 20, height: 20, thickness: 100,
    })).toThrow("inside profile dimensions");

    const dimensions = { width: 40, height: 40, thickness: 100 };
    expect(() => validatePanelCarrier(carrier, dimensions)).not.toThrow();
    const geometry = createLocalPanelCarrierGeometry({ dimensions, carrier });
    for (const [x, y, z] of geometry.triangles) {
      expect(Math.abs(x)).toBeLessThanOrEqual(dimensions.width / 2);
      expect(Math.abs(y)).toBeLessThanOrEqual(dimensions.height / 2);
      expect(Math.abs(z)).toBeLessThanOrEqual(dimensions.thickness / 2);
    }
  });

  it("rejects self-intersecting outlines and out-of-bounds paths", () => {
    const crossed = structuredClone(BASE_PROFILE);
    crossed.carrier = {
      kind: "planar-outline",
      outline: [[-20, -20], [20, 20], [-20, 20], [20, -20]],
    };
    expect(() => parsePanelHardwareProfile(crossed)).toThrow(
      /nonzero area|simple polygon/,
    );

    const outside = structuredClone(BASE_PROFILE);
    outside.carrier = {
      kind: "flexible-path",
      path: [[0, 0, 0], [40, 0, 0]],
      closed: false,
      width: 2,
      thickness: 0.8,
    };
    expect(() => parsePanelHardwareProfile(outside)).toThrow(
      "inside profile dimensions",
    );
  });

  it("keeps editing and mapping available while rectangular tools fail closed", async () => {
    const profile = ringProfile();
    const project = projectWith(profile);
    expect(deriveEditorCapabilities(
      project.sculpture,
      true,
      true,
      profile,
    )).toMatchObject({
      canSelectPanels: true,
      canExportMappingAndWiring: true,
      canCreateOnActiveSurface: false,
      canAutomaticallySeed: false,
      canGenerateGenericMechanics: false,
      canGenerateStructuralMechanics: false,
    });
    expect(() => preflightPanelBoundaryParts(project)).toThrow(
      "supports only rigid rectangular panel carriers",
    );
    expect(() => generateClosedPanelBoundary(
      project.sculpture,
      profile,
    )).toThrow("supports only rigid rectangular panel carriers");
    await expect(runStructuralPipeline(project)).rejects.toThrow(
      "supports only rigid rectangular panel carriers",
    );
    const normalized = normalizeStructuralDesign(project);
    await expect(buildStructuralRibbonSolids(
      normalized,
      createCandidateTruss(normalized),
    )).rejects.toThrow("supports only rigid rectangular panel carriers");
  });

  it("maps saved poses without entering incompatible rectangular mechanics", () => {
    const definition = parsePanelAssemblyDefinition(JSON.parse(readFileSync(
      "sculptures/cuboctahedron/sculpture.json",
      "utf8",
    )));
    const profile = planarProfile();
    definition.panelProfile = {
      id: profile.id,
      source: `catalog/panels/${profile.id}.json`,
    };
    const project = createPanelAssemblyProject(
      definition,
      "sculptures/cuboctahedron/sculpture.json",
      profile,
    );
    expect(project.sculpture.mechanicalShell).toBeDefined();
    expect(project.sculpture.closures).toBeDefined();
    expect(createPanelAssemblyMapping(project).entries).toHaveLength(6 * 64);
  });

  it("invalidates fabrication fingerprints when the carrier changes", () => {
    const definition = parsePanelAssemblyDefinition(JSON.parse(readFileSync(
      THREE_PANEL_SOURCE,
      "utf8",
    )));
    const rectangular = parsePanelHardwareProfile(BASE_PROFILE);
    const outlinedInput = structuredClone(BASE_PROFILE);
    outlinedInput.carrier = planarProfile().carrier;
    const outlined = parsePanelHardwareProfile(outlinedInput);
    const rectangularProject = createPanelAssemblyProject(
      definition,
      THREE_PANEL_SOURCE,
      rectangular,
    );
    expect(normalizeStructuralDesign(rectangularProject)).not.toHaveProperty(
      "panelCarrierKind",
    );

    expect(createGeneratedMechanicsFingerprint(definition, outlined)).not.toBe(
      createGeneratedMechanicsFingerprint(definition, rectangular),
    );
    expect(createStructuralFingerprint(definition, outlined)).not.toBe(
      createStructuralFingerprint(definition, rectangular),
    );
  });
});
