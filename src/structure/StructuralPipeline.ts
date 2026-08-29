import {
  compileStructuralArtifactBundle,
  createStructuralArtifactFile,
  extendStructuralArtifactBundle,
  type CompiledStructuralArtifactBundle,
  type StructuralArtifactFile,
} from "../cad/CompileStructuralArtifacts.ts";
import {
  buildStructuralRibbonSolids,
  type StructuralSolidMesh,
} from "../cad/GenerateStructuralSolids.ts";
import {
  createPanelAssemblyProject,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../sculpture/PanelAssembly.ts";
import { verifyProjectAssetBytes } from "../sculpture/GeneratedMechanics.ts";
import {
  normalizeStructuralDesign,
  STRUCTURAL_FABRICATION_CONTRACT_VERSION,
  validateGeneratedStructuralManifest,
  type GeneratedStructuralManifest,
  type NormalizedStructuralDesign,
  type StructuralVector,
} from "../sculpture/StructuralDesign.ts";
import { assertRectangularPanelTools } from "../sculpture/PanelCarrier.ts";
import { createCandidateTruss, type CandidateTruss } from "./CandidateTruss.ts";
import {
  optimizeStructuralTruss,
  type TrussOptimizationResult,
} from "./TrussOptimizer.ts";
import { TrussSolveError, type TrussMemberResult } from "./TrussSolver.ts";

const TEXT = new TextEncoder();
const DISCLAIMER = "Load-path guidance only; not engineering certification." as const;

export interface StructuralPipelineMemberResult {
  memberId: string;
  startNodeId: string;
  endNodeId: string;
  lengthMm: number;
  diameterMm: number;
  massKg: number;
  axialForceNewtons: number;
  forceType: TrussMemberResult["forceType"];
  stressMpa: number;
  stressUtilization: number;
  eulerBucklingCapacityNewtons: number;
  bucklingUtilization: number;
  governingLoadCaseId: string;
  connectorCellId?: string;
  analysisOnly: boolean;
}

export interface StructuralAnalysisDocument {
  schemaVersion: "1.1.0";
  generator: { id: "wled-orbital-lab/structural-pipeline"; version: "1.1.0" };
  disclaimer: typeof DISCLAIMER;
  sourceFingerprint: NormalizedStructuralDesign["sourceFingerprint"];
  units: NormalizedStructuralDesign["units"];
  inputSource: NormalizedStructuralDesign["inputSource"];
  referencePanelId: string | null;
  assumptions: string[];
  warnings: NormalizedStructuralDesign["warnings"];
  design: NormalizedStructuralDesign["design"];
  connectorization: NormalizedStructuralDesign["connectorization"];
  supports: NormalizedStructuralDesign["supports"];
  loadCases: NormalizedStructuralDesign["loadCases"];
  candidate: {
    nodes: number;
    initialMembers: number;
    rejectedMembers: number;
    retainedMembers: number;
    connectorCells: number;
  };
  printable: {
    parts: number;
    organicConnectors: number;
    multiPanelJunctions: number;
    surfaceBridges: number;
    surfaceBridgeJunctions: number;
    connectorBrackets: number;
    strutSegments: number;
    spliceSleeves: number;
    splitMembers: number;
    materialVolumeCubicMm: number;
    materialMassKg: number;
  };
  optimization: {
    status: TrussOptimizationResult["status"] | "unavailable";
    diagnostics: string[];
    policy: TrussOptimizationResult["policy"] | null;
    objective: number | null;
    objectiveBreakdown: TrussOptimizationResult["objectiveBreakdown"] | null;
    materialVolumeCubicMm: number | null;
    materialMassKg: number | null;
    violations: string[];
    trace: TrussOptimizationResult["trace"];
  };
  loadCaseResults: TrussOptimizationResult["analysis"]["loadCases"];
  members: StructuralPipelineMemberResult[];
  artifacts: Array<{
    id: string;
    role: StructuralArtifactFile["role"];
    format: StructuralArtifactFile["format"];
    source: string;
    byteLength: number;
    sha256: string;
  }>;
}

export interface StructuralPipelineResult {
  normalized: NormalizedStructuralDesign;
  candidate: CandidateTruss;
  optimization: TrussOptimizationResult | null;
  solids: StructuralSolidMesh[];
  analysis: StructuralAnalysisDocument;
  analysisBytes: Uint8Array;
  reportMarkdown: string;
  reportBytes: Uint8Array;
  definition: PanelAssemblyDefinition;
  generatedStructure: GeneratedStructuralManifest;
  bundle: CompiledStructuralArtifactBundle;
}

export interface StructuralPipelineOptions {
  designSurfaceBytes?: Uint8Array;
  advisoryOptimizer?: (
    normalized: NormalizedStructuralDesign,
    candidate: CandidateTruss,
  ) => TrussOptimizationResult;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalDesign(
  design: NormalizedStructuralDesign["design"],
): NormalizedStructuralDesign["design"] {
  const result = structuredClone(design);
  for (const support of result.supports) support.constrainedTranslations.sort(compareText);
  result.supports.sort((left, right) => compareText(left.id, right.id));
  result.loads.sort((left, right) => compareText(left.id, right.id));
  if (result.connectorization) {
    for (const override of result.connectorization.panelPairOverrides) {
      override.panelIds.sort(compareText);
    }
    result.connectorization.panelPairOverrides.sort((left, right) =>
      compareText(left.panelIds.join("\u0000"), right.panelIds.join("\u0000"))
    );
  }
  return result;
}

function canonicalDefinition(definition: PanelAssemblyDefinition): PanelAssemblyDefinition {
  const result = structuredClone(definition);
  result.panels.sort((left, right) => compareText(left.id, right.id));
  if (result.structuralDesign) {
    for (const support of result.structuralDesign.supports) {
      support.constrainedTranslations.sort(compareText);
    }
    result.structuralDesign.supports.sort((left, right) => compareText(left.id, right.id));
    result.structuralDesign.loads.sort((left, right) => compareText(left.id, right.id));
    result.structuralDesign.connectorization?.panelPairOverrides.sort((left, right) =>
      compareText([...left.panelIds].sort(compareText).join("\u0000"),
        [...right.panelIds].sort(compareText).join("\u0000"))
    );
    for (const override of result.structuralDesign.connectorization?.panelPairOverrides ?? []) {
      override.panelIds.sort(compareText);
    }
  }
  return result;
}

function assumptions(normalized: NormalizedStructuralDesign): string[] {
  const connectorAssumption = normalized.warnings.some(
    ({ code }) => code === "ELECTRICAL_KEEPOUTS_UNMEASURED",
  )
    ? "Exact connector pad geometry is unknown; measured connector corners inform cable loads but do not create ribbon bores."
    : "Connector locations inform cable loads but do not create ribbon bores.";
  const surfaceAssumption = normalized.connectorization.surfaceStyle === "led-surface-bridge"
    ? "Each connector cell uses complete pose-derived panel edges, 5 mm ridges, and a 2 mm ruled sheet at the profile-defined LED-emitter planes; mutually local sheets can unite."
    : "Each independent connector cell becomes one cap-surface loft; mutually local cells can share screw shoes and unite as one multi-panel ribbon junction.";
  return [
    "Panels are rigid load-transfer plates between their eligible mounting anchors.",
    "Panel-rigidity nodes and ties represent PCB/bracket plate stiffness for analysis only; they are not extra printable struts.",
    surfaceAssumption,
    "Connector generation depends on valid panel geometry, hardware clearances, PCB avoidance, and print limits; it does not depend on truss convergence.",
    "The axial truss validates local load paths and reports member sizing, but those circular sections do not set connector-surface thickness or certify stresses in the printable solid.",
    "Members are straight, pin-jointed, linearly elastic axial truss elements with three translational node degrees of freedom.",
    "Euler compression capacity uses a pinned-pinned end condition and the optimized circular section.",
    "Face loads are distributed across panel hubs; corner and cable loads use the nearest eligible hub as a rigid-bracket approximation.",
    `Material ${normalized.design.material.id} is treated as isotropic with authored or preview modulus, yield strength, and density. Printed anisotropy is not modeled.`,
    `PCB outlines are resolved profile envelopes. ${connectorAssumption}`,
    "Manufacturing tolerances, layer adhesion, creep, impact, fatigue, fastener preload, joint slip, and environmental degradation require physical review.",
  ];
}

function enrichedMembers(optimization: TrussOptimizationResult): StructuralPipelineMemberResult[] {
  const candidateById = new Map(
    optimization.optimizedCandidate.members.map((member) => [member.id, member]),
  );
  const governingById = new Map(
    optimization.analysis.governingMembers.map((member) => [member.memberId, member]),
  );
  return optimization.members.map((member) => {
    const candidate = candidateById.get(member.memberId)!;
    const governing = governingById.get(member.memberId)!;
    return {
      memberId: member.memberId,
      startNodeId: candidate.startNodeId,
      endNodeId: candidate.endNodeId,
      lengthMm: candidate.lengthMm,
      diameterMm: member.diameterMm,
      massKg: member.massKg,
      axialForceNewtons: governing.axialForceNewtons,
      forceType: governing.forceType,
      stressMpa: governing.stressMpa,
      stressUtilization: governing.utilization,
      eulerBucklingCapacityNewtons: governing.eulerBucklingCapacityNewtons,
      bucklingUtilization: governing.bucklingUtilization,
      governingLoadCaseId: member.governingLoadCaseId,
      analysisOnly: candidate.analysisOnly === true,
      ...(candidate.connectorCellId
        ? { connectorCellId: candidate.connectorCellId }
        : {}),
    };
  }).sort((left, right) => compareText(left.memberId, right.memberId));
}

function artifactReferences(files: StructuralArtifactFile[]): StructuralAnalysisDocument["artifacts"] {
  return [...files].sort((left, right) => compareText(left.source, right.source))
    .map(({ id, role, format, source, bytes, sha256 }) => ({
      id, role, format, source, byteLength: bytes.byteLength, sha256,
    }));
}

function analysisDocument(
  normalized: NormalizedStructuralDesign,
  candidate: CandidateTruss,
  optimization: TrussOptimizationResult | null,
  diagnostics: string[],
  printFiles: StructuralArtifactFile[],
  solids: StructuralSolidMesh[],
): StructuralAnalysisDocument {
  return {
    schemaVersion: "1.1.0",
    generator: { id: "wled-orbital-lab/structural-pipeline", version: "1.1.0" },
    disclaimer: DISCLAIMER,
    sourceFingerprint: { ...normalized.sourceFingerprint },
    units: { ...normalized.units },
    inputSource: normalized.inputSource,
    referencePanelId: normalized.referencePanelId,
    assumptions: assumptions(normalized),
    warnings: structuredClone(normalized.warnings),
    design: canonicalDesign(normalized.design),
    connectorization: structuredClone(normalized.connectorization),
    supports: structuredClone(normalized.supports)
      .filter(({ anchorId }) => candidate.anchors.some(({ id }) => id === anchorId))
      .sort((left, right) => compareText(left.id, right.id)),
    loadCases: structuredClone(normalized.loadCases)
      .sort((left, right) => compareText(left.id, right.id)),
    candidate: {
      nodes: candidate.nodes.length,
      initialMembers: candidate.members.length,
      rejectedMembers: candidate.rejectedMembers.length,
      retainedMembers: optimization?.optimizedCandidate.members.length ?? 0,
      connectorCells: candidate.connectorCells.length,
    },
    printable: {
      parts: solids.length,
      organicConnectors: solids.filter(({ kind }) => kind === "organic-connector").length,
      multiPanelJunctions: solids.filter(({ kind }) => kind === "ribbon-junction").length,
      surfaceBridges: solids.filter(({ kind }) => kind === "surface-bridge").length,
      surfaceBridgeJunctions: solids.filter(
        ({ kind }) => kind === "surface-bridge-junction",
      ).length,
      connectorBrackets: solids.filter(({ kind }) => kind === "connector-bracket").length,
      strutSegments: solids.filter(({ kind }) => kind === "strut-segment").length,
      spliceSleeves: solids.filter(({ kind }) => kind === "splice-sleeve").length,
      splitMembers: new Set(solids.filter(({ segmentCount }) => (segmentCount ?? 1) > 1)
        .map(({ memberId }) => memberId)).size,
      materialVolumeCubicMm: solids.reduce((sum, solid) => sum + solid.volumeCubicMm, 0),
      materialMassKg: solids.reduce((sum, solid) => sum + solid.volumeCubicMm, 0) *
        1e-9 * normalized.design.material.densityKgPerCubicMeter,
    },
    optimization: {
      status: optimization?.status ?? "unavailable",
      diagnostics: [...diagnostics],
      policy: optimization ? structuredClone(optimization.policy) : null,
      objective: optimization?.objective ?? null,
      objectiveBreakdown: optimization
        ? structuredClone(optimization.objectiveBreakdown)
        : null,
      materialVolumeCubicMm: optimization?.materialVolumeCubicMm ?? null,
      materialMassKg: optimization?.materialMassKg ?? null,
      violations: optimization ? [...optimization.violations] : [],
      trace: optimization ? structuredClone(optimization.trace) : [],
    },
    loadCaseResults: optimization ? structuredClone(optimization.analysis.loadCases) : [],
    members: optimization ? enrichedMembers(optimization) : [],
    artifacts: artifactReferences(printFiles),
  };
}

function finite(value: number, digits = 4): string {
  if (!Number.isFinite(value)) throw new Error("Engineering report received a non-finite result.");
  return Number(value.toFixed(digits)).toString();
}

function markdown(value: string): string {
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

function vector(value: StructuralVector): string {
  return `[${value.map((component) => finite(component, 5)).join(", ")}]`;
}

function report(
  normalized: NormalizedStructuralDesign,
  analysis: StructuralAnalysisDocument,
  reportArtifacts: StructuralAnalysisDocument["artifacts"],
): string {
  const lines = [
    "# Structural load-path engineering report",
    "",
    "> **WARNING: LOAD-PATH GUIDANCE ONLY. THIS REPORT IS NOT ENGINEERING CERTIFICATION.**",
    "",
    "Panel poses, profile-defined LED planes, and eligible screw holes define the selected printable connector surface. The separate linear truss model is advisory only. A qualified engineer and physical tests must approve real mounting, material, print, fastener, impact, fatigue, and safety conditions.",
    "",
    "## Result",
    "",
    `- Source fingerprint: \`${analysis.sourceFingerprint.value}\``,
    `- Input source: ${analysis.inputSource === "authored" ? "authored structural design" : "preview defaults; replace before physical use"}`,
    `- Optimization status: ${analysis.optimization.status}`,
    `- Safety factor: ${finite(analysis.design.safetyFactor)}`,
    `- Material: ${markdown(analysis.design.material.id)}; E ${finite(analysis.design.material.youngsModulusMpa)} MPa; yield ${finite(analysis.design.material.yieldStrengthMpa)} MPa; density ${finite(analysis.design.material.densityKgPerCubicMeter)} kg/m^3`,
    `- Panel mass: ${finite(analysis.design.panelMassKg)} kg each`,
    analysis.optimization.materialVolumeCubicMm === null ||
        analysis.optimization.materialMassKg === null
      ? "- Optimized axial-skeleton material: unavailable; see analysis warning"
      : `- Optimized axial-skeleton material: ${finite(analysis.optimization.materialVolumeCubicMm, 2)} mm^3; ${finite(analysis.optimization.materialMassKg, 5)} kg`,
    `- Connector surface style: ${analysis.connectorization.surfaceStyle ?? "screw-shoe-ribbon"}`,
    `- Final printable connector material: ${finite(analysis.printable.materialVolumeCubicMm, 2)} mm^3; ${finite(analysis.printable.materialMassKg, 5)} kg`,
    `- Candidate members: ${analysis.candidate.initialMembers}; retained: ${analysis.candidate.retainedMembers}`,
    `- Local panel-pair connectors: ${analysis.candidate.connectorCells}`,
    `- Printable parts: ${analysis.printable.parts}; panel-pair ribbon bodies: ${analysis.printable.organicConnectors}; multi-panel ribbon junctions: ${analysis.printable.multiPanelJunctions}; LED-surface bridges: ${analysis.printable.surfaceBridges}; LED-surface junctions: ${analysis.printable.surfaceBridgeJunctions}; separate brackets: ${analysis.printable.connectorBrackets}; strut segments: ${analysis.printable.strutSegments}; splice sleeves: ${analysis.printable.spliceSleeves}`,
    `- Split members: ${analysis.printable.splitMembers}`,
    `- Print envelope: ${analysis.connectorization.printBedSizeMm.join(" × ")} mm with ${finite(analysis.connectorization.printBedMarginMm)} mm margin`,
    "",
  ];
  if (analysis.optimization.status !== "converged") {
    lines.push(
      "> **ANALYSIS WARNING: THE PRINTABLE CONNECTOR SURFACE WAS GENERATED FROM PANEL GEOMETRY, BUT THE ADVISORY TRUSS ANALYSIS DID NOT CONVERGE. DO NOT USE IT AS STRUCTURAL APPROVAL.**",
      "",
      ...analysis.optimization.diagnostics.map((diagnostic) =>
        `> ${markdown(diagnostic)}`
      ),
      "",
    );
  }
  if (analysis.printable.splitMembers > 0) {
    lines.push(
      `> **PRINT SPLIT WARNING: ${analysis.printable.splitMembers} MEMBER(S) EXCEED THE CONFIGURED SEGMENT LENGTH AND REQUIRE NUMBERED SEGMENTS PLUS SPLICE SLEEVES.**`,
      "",
    );
  }
  if (normalized.supports.some(({ source }) => source === "preview-reference-panel")) {
    lines.push(
      "> **MOUNTING WARNING: NO REAL SUPPORT WAS AUTHORED. THE REFERENCE PANEL IS FIXED FOR PREVIEW ONLY. ANALYSIS REQUIRES REAL MOUNTING CONDITIONS.**",
      "",
    );
  }
  lines.push("## Warnings", "");
  for (const warning of analysis.warnings) {
    lines.push(`- **${warning.code}:** ${markdown(warning.message)}`);
  }
  if (analysis.warnings.length === 0) lines.push("- No normalization warnings.");
  lines.push("", "## Supports", "", "| Support | Anchor | Translations | Source |", "| --- | --- | --- | --- |");
  for (const support of analysis.supports) {
    lines.push(`| ${markdown(support.id)} | ${markdown(support.anchorId)} | ${support.constrainedTranslations.join(", ")} | ${support.source} |`);
  }
  lines.push("", "## Load cases", "", "| Load case | Kind | Applied data |", "| --- | --- | --- |");
  for (const loadCase of analysis.loadCases) {
    const detail = loadCase.kind === "gravity"
      ? `${loadCase.source} direction ${vector(loadCase.direction)} at ${finite(loadCase.accelerationMetersPerSecondSquared, 5)} m/s^2`
      : `panel ${markdown(loadCase.panelId)} at ${vector(loadCase.applicationPointMm)} mm; force ${vector(loadCase.forceNewtons)} N`;
    lines.push(`| ${markdown(loadCase.id)} | ${loadCase.kind} | ${detail} |`);
  }
  lines.push("", "## Displacement results", "", "| Load case | Maximum displacement (mm) | Node | Equilibrium residual (N) |", "| --- | ---: | --- | --- |");
  for (const loadCase of analysis.loadCaseResults) {
    lines.push(
      `| ${markdown(loadCase.id)} | ${finite(loadCase.maximumDisplacementMm, 6)} | ${markdown(loadCase.maximumDisplacementNodeId)} | ${vector(loadCase.equilibriumResidualNewtons)} |`,
    );
  }
  lines.push(
    "",
    "## Member results",
    "",
    "Stress utilization includes the configured safety factor. Euler buckling utilization is approximate and uses a pinned-pinned compression member.",
    "",
    "| Member | Role | Length (mm) | Diameter (mm) | State | Axial force (N) | Stress (MPa) | Stress util. | Euler capacity (N) | Buckling util. | Governing case |",
    "| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  for (const member of analysis.members) {
    lines.push(
      `| ${markdown(member.memberId)} | ${member.analysisOnly ? "panel-rigidity model" : "printable"} | ${finite(member.lengthMm, 3)} | ${finite(member.diameterMm, 3)} | ${member.forceType} | ${finite(member.axialForceNewtons, 4)} | ${finite(member.stressMpa, 5)} | ${finite(member.stressUtilization, 5)} | ${finite(member.eulerBucklingCapacityNewtons, 3)} | ${finite(member.bucklingUtilization, 5)} | ${markdown(member.governingLoadCaseId)} |`,
    );
  }
  lines.push(
    "",
    "## Optimization history",
    "",
    "| Iteration | Action | Members | Removed | Resized | Objective | Stress util. | Buckling util. | Displacement util. |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const entry of analysis.optimization.trace) {
    lines.push(
      `| ${entry.iteration} | ${entry.action} | ${entry.evaluatedMemberCount} | ${entry.removedMemberIds.length} | ${entry.resizedMemberIds.length} | ${finite(entry.objective, 4)} | ${finite(entry.maximumStressUtilization, 5)} | ${finite(entry.maximumBucklingUtilization, 5)} | ${finite(entry.maximumDisplacementUtilization, 5)} |`,
    );
  }
  lines.push("", "## Assumptions and limits", "");
  for (const item of analysis.assumptions) lines.push(`- ${markdown(item)}`);
  lines.push("", "## Artifact hashes", "", "| Artifact | Role | Bytes | SHA-256 |", "| --- | --- | ---: | --- |");
  for (const artifact of reportArtifacts) {
    lines.push(`| ${markdown(artifact.source)} | ${artifact.role} | ${artifact.byteLength} | \`${artifact.sha256}\` |`);
  }
  lines.push(
    "",
    "The outer generated-structure manifest records the SHA-256 of this report itself.",
    "",
    `**${DISCLAIMER}**`,
    "",
  );
  return lines.join("\n");
}

function generatedManifest(
  fingerprint: NormalizedStructuralDesign["sourceFingerprint"],
  files: StructuralArtifactFile[],
): GeneratedStructuralManifest {
  const generatedRoles = new Set<StructuralArtifactFile["role"]>([
    "part", "preview", "package", "analysis", "report",
  ]);
  const artifacts = files
    .filter(({ role }) => generatedRoles.has(role))
    .map(({ id, role, format, source, sha256 }) => ({
      id,
      role,
      format,
      source,
      sha256,
    }));
  const manifest: GeneratedStructuralManifest = {
    schemaVersion: "1.0.0",
    generator: {
      id: "wled-orbital-lab/structural-pipeline",
      version: STRUCTURAL_FABRICATION_CONTRACT_VERSION,
    },
    sourceFingerprint: { ...fingerprint },
    status: { generation: "complete", validation: "passed" },
    artifacts: artifacts as GeneratedStructuralManifest["artifacts"],
  };
  validateGeneratedStructuralManifest(manifest);
  return manifest;
}

export async function runStructuralPipeline(
  project: PanelAssemblyProject,
  options: StructuralPipelineOptions = {},
): Promise<StructuralPipelineResult> {
  assertRectangularPanelTools(
    project.panelProfile,
    "Structural connector generation",
  );
  const normalized = normalizeStructuralDesign(project);
  const candidate = createCandidateTruss(normalized);
  let optimization: TrussOptimizationResult | null = null;
  const diagnostics: string[] = [];
  try {
    optimization = (options.advisoryOptimizer ?? optimizeStructuralTruss)(
      normalized,
      candidate,
    );
    if (optimization.status !== "converged") {
      diagnostics.push(
        `Advisory structural optimization is ${optimization.status}: ` +
        (optimization.violations.join(" ") || "iteration limit reached."),
      );
    }
  } catch (error) {
    if (
      !(error instanceof TrussSolveError) ||
      (error.code !== "SINGULAR_SYSTEM" && error.code !== "NUMERICAL_FAILURE")
    ) throw error;
    diagnostics.push(`Advisory structural analysis is unavailable: ${error.message}`);
  }
  const solids = await buildStructuralRibbonSolids(normalized, candidate);
  const printBundle = compileStructuralArtifactBundle(normalized.sourceFingerprint, solids);
  const analysis = analysisDocument(
    normalized,
    candidate,
    optimization,
    diagnostics,
    printBundle.files,
    solids,
  );
  const analysisBytes = TEXT.encode(`${JSON.stringify(analysis, null, 2)}\n`);
  const analysisFile = createStructuralArtifactFile(
    "analysis", "analysis", "json", "structure/analysis.json", analysisBytes,
  );
  const reportArtifacts = [
    ...artifactReferences(printBundle.files),
    ...artifactReferences([analysisFile]),
  ].sort((left, right) => compareText(left.source, right.source));
  const reportMarkdown = report(normalized, analysis, reportArtifacts);
  const reportBytes = TEXT.encode(reportMarkdown);
  const reportFile = createStructuralArtifactFile(
    "engineering-report", "report", "markdown", "structure/report.md", reportBytes,
  );
  const generatedStructure = generatedManifest(
    normalized.sourceFingerprint,
    [...printBundle.files, analysisFile, reportFile],
  );
  const profileBytes = TEXT.encode(`${JSON.stringify(project.panelProfile, null, 2)}\n`);
  const profileFile = createStructuralArtifactFile(
    "panel-profile", "profile", "json", "catalog/panel-profile.json", profileBytes,
  );
  let designSurfaceFile: StructuralArtifactFile | undefined;
  if (project.sculpture.designSurface) {
    if (!options.designSurfaceBytes) {
      throw new Error(
        `Structural generation requires verified bytes for design surface ${project.sculpture.designSurface.source}.`,
      );
    }
    verifyProjectAssetBytes(
      project.sculpture.designSurface,
      options.designSurfaceBytes,
      "Structural design surface",
    );
    designSurfaceFile = createStructuralArtifactFile(
      "design-surface", "source", "glb", "assets/design-surface.glb", options.designSurfaceBytes,
    );
  } else if (options.designSurfaceBytes) {
    throw new Error("Structural generation received design-surface bytes for a project without a design surface.");
  }
  const definition = canonicalDefinition(project.sculpture);
  definition.panelProfile.source = profileFile.source;
  if (definition.designSurface) definition.designSurface.source = designSurfaceFile!.source;
  definition.generatedStructure = generatedStructure;
  createPanelAssemblyProject(definition, project.source, project.panelProfile);
  const projectBytes = TEXT.encode(`${JSON.stringify(definition, null, 2)}\n`);
  const projectFile = createStructuralArtifactFile(
    "project", "project", "json", "sculpture.json", projectBytes,
  );
  const bundle = extendStructuralArtifactBundle(
    printBundle,
    [analysisFile, reportFile, profileFile, ...(designSurfaceFile ? [designSurfaceFile] : []), projectFile],
  );
  return {
    normalized,
    candidate,
    optimization,
    solids,
    analysis,
    analysisBytes,
    reportMarkdown,
    reportBytes,
    definition,
    generatedStructure,
    bundle,
  };
}
