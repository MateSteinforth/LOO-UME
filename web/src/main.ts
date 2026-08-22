import "./styles.css";
import {
  createUniformSphereMapping,
  validateMapping,
} from "./LedMapping";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
  type HardwareMappingContract,
} from "./HardwareMapping";
import {
  createPanelAssemblyProject,
  createPanelAssemblyMapping,
  getGeneratedMechanicsState,
  loadPanelAssemblyProject,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly";
import {
  addPanelOnDesignSurface,
  addPanelToClosureFace,
  automaticallySeedPanelsOnSurface,
  deletePanel,
  movePanelOnDesignSurface,
  movePanelInLocalPlane,
  rotatePanelAroundLocalZ,
  sculptureJson,
} from "../../src/sculpture/SculptureEditor";
import {
  generateClosedPanelBoundary,
} from "../../src/sculpture/PanelOutlineBoundary";
import {
  loadGlbDesignSurface,
  loadMechanicalShellDesignSurface,
  placementMeshFromSurface,
  type LoadedDesignSurface,
} from "./DesignSurfaceLoader";
import { SphereRenderer, type DisplayMode } from "./SphereRenderer";
import { deriveEditorCapabilities } from "./EditorCapabilities.ts";
import { WledEngine } from "./WledEngine";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "./WiringPreview";
import {
  confirmWiringRouteEditorModel,
  copyDraftSuggestionToRouteEditor,
  createWiringRouteEditorModel,
  moveRoutePanelToOutput,
  moveRoutePanelToPosition,
  validateWiringRouteEditorModel,
  type WiringRouteEditorModel,
} from "./WiringRouteEditor";
import {
  loadVerifiedGeneratedMechanics,
  type VerifiedGeneratedMechanics,
} from "./GeneratedMechanicsAssets.ts";
import {
  createPortableProjectZip,
  openPortableProjectFiles,
  openPortableProjectZip,
  portableProjectFolderName,
  writePortableProjectFolder,
  type PortableDirectoryHandle,
  type PortableProjectBundle,
  type PortableProjectFile,
} from "./PortableProject.ts";
import { loadGeneratorStatus } from "./GeneratorStatus.ts";
import { createEditorPipelineFormData } from "./EditorPipelineRequest.ts";
import {
  createWiringAssemblyManualModel,
  renderStandaloneWiringAssemblyManualDocument,
} from "./WiringAssemblyManual.ts";
import { compilePanelBoundaryBundle } from "../../src/cad/CompilePanelBoundaryBundle.ts";
import {
  readEditorPipelineResult,
  shouldUseEditorPipelineFallback,
} from "./EditorPipelineResponse.ts";
import { readJsonResponse } from "./JsonResponse.ts";
import {
  createAssemblyPackageZip,
  createWiringReview,
} from "./AssemblyPackage.ts";
import wiringManualStyles from "./wiring-manual.css?raw";

const DEFAULT_SCULPTURE_JSON = "./sculptures/pose-only-rhombicosidodecahedron/sculpture.json";
const SCULPTURE_REGISTRY_URL = "./sculptures/manifest.json";
const DEFAULT_PRIMARY_COLOR = "#ff7a18";
const DEFAULT_SECONDARY_COLOR = "#050816";
const DEFAULT_SHELL_TRANSPARENCY = 0.35;
const initialSculptureSource =
  new URLSearchParams(window.location.search).get("sculptureJson") ??
  DEFAULT_SCULPTURE_JSON;

interface SculptureRegistryEntry {
  id: string;
  name: string;
  source: string;
}

interface SculptureRegistry {
  schemaVersion: "1.0.0";
  defaultSource: string;
  sculptures: SculptureRegistryEntry[];
}

interface LoadedSculpture {
  definition: PanelAssemblyDefinition;
  project: PanelAssemblyProject;
  contract: HardwareMappingContract;
}

async function loadSculptureRegistry(): Promise<SculptureRegistry> {
  const response = await fetch(SCULPTURE_REGISTRY_URL);
  if (!response.ok) {
    throw new Error(
      "Unable to load sculpture registry: HTTP " + response.status + ".",
    );
  }
  const registry = (await readJsonResponse(
    response,
    "Sculpture registry",
  )) as Partial<SculptureRegistry>;
  if (
    registry.schemaVersion !== "1.0.0" ||
    !Array.isArray(registry.sculptures) ||
    registry.sculptures.length === 0 ||
    registry.sculptures.some(
      (entry) =>
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.source !== "string",
    )
  ) {
    throw new Error("Sculpture registry is invalid.");
  }
  return registry as SculptureRegistry;
}

function createLoadedSculpture(project: PanelAssemblyProject): LoadedSculpture {
  const geometry = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    geometry,
    project.sculpture,
    project.panelProfile,
  );
  return {
    definition: project.sculpture,
    project,
    contract: createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    ),
  };
}

async function loadSculptureContract(
  source: string,
): Promise<LoadedSculpture> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      "Unable to load sculpture JSON " + source + ": HTTP " + response.status + ".",
    );
  }
  const sculptureInput = await readJsonResponse(response, "Sculpture JSON");
  const project = await loadPanelAssemblyProject(
    sculptureInput,
    source,
    async (reference) => {
      const profileUrl = new URL(reference.source, response.url);
      const profileResponse = await fetch(profileUrl);
      if (!profileResponse.ok) {
        throw new Error(
          "Unable to load panel profile " +
            reference.id +
            ": HTTP " +
            profileResponse.status +
            ".",
        );
      }
      return readJsonResponse(profileResponse, "Panel profile");
    },
  );
  return createLoadedSculpture(project);
}

async function loadLocalSculpture(file: File): Promise<LoadedSculpture> {
  const input: unknown = JSON.parse(await file.text());
  const project = await loadPanelAssemblyProject(
    input,
    `local:${file.name}`,
    loadStagedPanelProfile,
  );
  return createLoadedSculpture(project);
}

async function loadStagedPanelProfile(
  reference: PanelAssemblyDefinition["panelProfile"],
): Promise<unknown> {
  const profileResponse = await fetch(
    new URL(`./catalog/panels/${reference.id}.json`, document.baseURI),
  );
  if (!profileResponse.ok) {
    throw new Error(
      `Unable to find panel profile ${reference.id} in the staged catalog.`,
    );
  }
  return readJsonResponse(profileResponse, "Panel profile");
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p class="eyebrow">LED sculpture simulator</p>
          <h1>WLED Orbital Lab</h1>
        </div>
      </div>
      <span id="engine-status" hidden>Loading WebAssembly…</span>
    </header>

    <main class="workspace">
      <section class="viewer-panel" aria-label="3D LED sphere">
        <div id="viewer" class="viewer"></div>
        <div class="viewer-overlay viewer-overlay--bottom">
          <div class="metric">
            <span class="metric-label">FPS</span>
            <strong id="fps">—</strong>
          </div>
          <div class="metric">
            <span class="metric-label">LEDs</span>
            <strong id="led-count-display">—</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Panels</span>
            <strong id="panel-count-display">—</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Frame</span>
            <strong id="frame-time">0 ms</strong>
          </div>
        </div>
        <div id="viewer-error" class="viewer-error" hidden></div>
      </section>

      <aside class="control-panel">
        <section class="control-section">
          <div class="section-heading">
            <span>WLED engine</span>
          </div>
          <label class="field">
            <span>Effect</span>
            <select id="effect"></select>
          </label>
          <label class="field">
            <span>Palette</span>
            <select id="palette"></select>
          </label>
          <label class="field slider-field">
            <span>Speed <output id="speed-value">128</output></span>
            <input id="speed" type="range" min="0" max="255" value="128" />
          </label>
          <label class="field slider-field">
            <span>Intensity <output id="intensity-value">128</output></span>
            <input id="intensity" type="range" min="0" max="255" value="128" />
          </label>
        </section>

        <section class="control-section">
          <div class="section-heading">
            <span>Mapping</span>
            <small>logical ≠ physical</small>
          </div>
          <label class="field">
            <span>Processed sculpture</span>
            <select id="sculpture-select">
              <option value="">Loading sculpture registry…</option>
            </select>
          </label>
          <label class="field">
            <span>Display</span>
            <select id="display-mode">
              <option value="wled">WLED framebuffer</option>
              <option value="physical-index">Physical index bands</option>
              <option value="logical-index">Logical index bands</option>
            </select>
          </label>
          <label class="toggle-field">
            <input id="auto-rotate" type="checkbox" checked />
            <span>Slow auto-rotation</span>
          </label>
          <label class="toggle-field">
            <input id="panel-labels" type="checkbox" checked />
            <span>Panel IDs</span>
          </label>
          <label class="toggle-field">
            <input id="printable-layer" type="checkbox" checked />
            <span>Exact Manifold closures + screw tabs</span>
          </label>
          <div id="wiring-layer-controls" class="layer-controls">
            <div class="layer-controls__heading">Wiring layers</div>
            <label class="toggle-field">
              <input id="connector-layer" type="checkbox" checked />
              <span>Panel DIN / DOUT + direction</span>
            </label>
            <label class="toggle-field">
              <input id="wiring-layer" type="checkbox" checked />
              <span>Panel-to-panel wiring</span>
            </label>
            <div id="output-layer-list" class="output-layer-list" aria-label="Controller output visibility"></div>
            <div class="connector-key">
              <span><i class="connector-dot connector-dot--din"></i>DIN</span>
              <span><i class="connector-dot connector-dot--dout"></i>DOUT</span>
              <small>Gold = closure tab to PCB mounting hole</small>
              <small>Back view: DIN bottom-left · DOUT top-right; pad centres TBD</small>
              <small>Data only · controller assumed near the sculpture top</small>
            </div>
          </div>
          <div id="mapping-status" class="validation-row">
            <span class="validation-icon">✓</span>
            <span>Mapping LUT is valid</span>
          </div>
          <p id="mapping-note" hidden>Transforms, pixel order, and wiring are unmeasured.</p>
        </section>

        <section class="control-section editor-section">
          <div class="section-heading">
            <span>Sculpture editor</span>
          </div>
          <input id="project-file" type="file" accept="application/json,application/zip,.json,.zip" hidden />
          <input id="project-folder" type="file" webkitdirectory multiple hidden />
          <input id="design-surface-file" type="file" accept="model/gltf-binary,.glb" hidden />
          <div class="project-actions">
            <details class="action-menu">
              <summary>Open project</summary>
              <div class="action-menu__items">
                <button id="open-project-file" type="button">Open JSON or ZIP</button>
                <button id="open-project-folder" type="button">Open folder</button>
              </div>
            </details>
            <button id="save-project" class="editor-button" type="button">Save project ZIP</button>
          </div>
          <details id="advanced-tools" class="compact-menu">
            <summary>Advanced tools</summary>
            <div class="compact-menu__content">
              <label class="field">
                <span>Custom sculpture JSON URL</span>
                <div class="input-action">
                  <input id="sculpture-json" type="text" />
                  <button id="load-sculpture" type="button">Load</button>
                </div>
              </label>
              <label class="field">
                <span>Virtual LED count</span>
                <div class="input-action">
                  <input id="led-count" type="number" min="64" max="200000" step="1" value="64" />
                  <button id="apply-count" type="button">Apply</button>
                </div>
              </label>
              <button id="save-sculpture-file" class="editor-button" type="button">Export raw JSON</button>
              <button id="export-project-folder" class="editor-button" type="button">Export project folder</button>
            </div>
          </details>
          <section id="route-editor-section" class="route-editor-section" hidden>
            <div class="section-heading editor-subheading">
              <span>Wiring route editor</span>
              <small>controller to DIN to DOUT</small>
            </div>
            <p id="route-editor-note" class="mapping-note"></p>
            <div id="route-editor" class="route-editor" aria-label="Panel wiring route editor"></div>
            <button id="route-action" class="editor-button" type="button">Edit suggested route</button>
            <p id="route-editor-status" class="route-editor-status" aria-live="polite"></p>
          </section>
          <div class="section-heading editor-subheading">
            <span>Design surface</span>
            <small>watertight GLB</small>
          </div>
          <label class="field">
            <span>GLB units to millimetres</span>
            <input id="surface-scale" type="number" min="0.000001" step="any" value="1000" />
          </label>
          <button id="load-design-surface" class="editor-button" type="button">
            Load watertight GLB
          </button>
          <p id="surface-status" class="mapping-note">
            Load a GLB, or use the sculpture JSON shell as the editing surface.
          </p>
          <p id="selected-panel-status" class="mapping-note"></p>
          <div id="automatic-panel-placement-controls">
            <label class="field">
              <span>Target panel count</span>
              <input id="automatic-panel-count" type="number" min="1" step="1" value="6" />
            </label>
            <button id="automatically-place-panels" class="editor-button" type="button" disabled>
              Automatically place panels
            </button>
          </div>
          <div id="add-panel-controls" hidden>
            <label class="field">
              <span>Available closure face</span>
              <select id="add-panel-face"></select>
            </label>
            <button id="add-panel" class="editor-button" type="button" hidden>
              Add panel to selected face
            </button>
          </div>
          <div class="pipeline-actions">
            <button id="assembly-package" class="pipeline-button" type="button">
              Build assembly package
            </button>
            <details class="compact-menu export-menu">
              <summary>Export individual files</summary>
              <div class="compact-menu__content">
                <button id="open-wiring-manual" class="editor-button" type="button">Assembly manual HTML</button>
                <button id="generate-mapping" class="editor-button" type="button">Ledmap + wiring review</button>
              </div>
            </details>
          </div>
          <div id="pipeline-status" class="pipeline-status" role="status">
            Local Vite pipeline is ready.
          </div>
        </section>
      </aside>
    </main>
  </div>
`;

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const viewerElement = query<HTMLDivElement>("#viewer");
const engineStatus = query<HTMLSpanElement>("#engine-status");
const viewerError = query<HTMLDivElement>("#viewer-error");
const fpsDisplay = query<HTMLElement>("#fps");
const ledCountDisplay = query<HTMLElement>("#led-count-display");
const panelCountDisplay = query<HTMLElement>("#panel-count-display");
const frameTimeDisplay = query<HTMLElement>("#frame-time");
const effectSelect = query<HTMLSelectElement>("#effect");
const paletteSelect = query<HTMLSelectElement>("#palette");
const speedInput = query<HTMLInputElement>("#speed");
const speedValue = query<HTMLOutputElement>("#speed-value");
const intensityInput = query<HTMLInputElement>("#intensity");
const intensityValue = query<HTMLOutputElement>("#intensity-value");
const sculptureSelect = query<HTMLSelectElement>("#sculpture-select");
const sculptureJsonInput = query<HTMLInputElement>("#sculpture-json");
const loadSculptureButton = query<HTMLButtonElement>("#load-sculpture");
const advancedTools = query<HTMLDetailsElement>("#advanced-tools");
const ledCountInput = query<HTMLInputElement>("#led-count");
const applyCountButton = query<HTMLButtonElement>("#apply-count");
const displayMode = query<HTMLSelectElement>("#display-mode");
const autoRotate = query<HTMLInputElement>("#auto-rotate");
const mappingStatus = query<HTMLElement>("#mapping-status");
const mappingNote = query<HTMLElement>("#mapping-note");
const panelLabelsToggle = query<HTMLInputElement>("#panel-labels");
const printableLayerToggle = query<HTMLInputElement>("#printable-layer");
const connectorLayerToggle =
  query<HTMLInputElement>("#connector-layer");
const wiringLayerToggle = query<HTMLInputElement>("#wiring-layer");
const wiringLayerControls = query<HTMLElement>("#wiring-layer-controls");
const outputLayerList = query<HTMLElement>("#output-layer-list");
const projectFileInput = query<HTMLInputElement>("#project-file");
const openProjectFileButton = query<HTMLButtonElement>("#open-project-file");
const saveSculptureFileButton =
  query<HTMLButtonElement>("#save-sculpture-file");
const projectFolderInput = query<HTMLInputElement>("#project-folder");
const openProjectFolderButton =
  query<HTMLButtonElement>("#open-project-folder");
const exportProjectFolderButton =
  query<HTMLButtonElement>("#export-project-folder");
const saveProjectButton = query<HTMLButtonElement>("#save-project");
const routeEditorSection = query<HTMLElement>("#route-editor-section");
const routeEditorNote = query<HTMLElement>("#route-editor-note");
const routeEditor = query<HTMLElement>("#route-editor");
const routeActionButton = query<HTMLButtonElement>("#route-action");
const routeEditorStatus = query<HTMLElement>("#route-editor-status");
const designSurfaceFileInput =
  query<HTMLInputElement>("#design-surface-file");
const loadDesignSurfaceButton =
  query<HTMLButtonElement>("#load-design-surface");
const surfaceScaleInput = query<HTMLInputElement>("#surface-scale");
const surfaceStatus = query<HTMLElement>("#surface-status");
const selectedPanelStatus = query<HTMLElement>("#selected-panel-status");
const automaticPanelPlacementControls =
  query<HTMLElement>("#automatic-panel-placement-controls");
const automaticPanelCountInput =
  query<HTMLInputElement>("#automatic-panel-count");
const automaticallyPlacePanelsButton =
  query<HTMLButtonElement>("#automatically-place-panels");
const addPanelFaceSelect = query<HTMLSelectElement>("#add-panel-face");
const addPanelButton = query<HTMLButtonElement>("#add-panel");
const addPanelControls = query<HTMLElement>("#add-panel-controls");
const generateMappingButton =
  query<HTMLButtonElement>("#generate-mapping");
const openWiringManualButton =
  query<HTMLButtonElement>("#open-wiring-manual");
const assemblyPackageButton = query<HTMLButtonElement>("#assembly-package");
const pipelineStatus = query<HTMLElement>("#pipeline-status");
let pipelineAvailable = false;
let pipelineAvailabilityMessage =
  "Checking local Manifold availability. Mapping and wiring remain available.";
assemblyPackageButton.disabled = true;
pipelineStatus.textContent = pipelineAvailabilityMessage;
let outputLayerToggles: HTMLInputElement[] = [];

let renderer: SphereRenderer | undefined;
let animationFrame = 0;

async function start(): Promise<void> {
  try {
    const generatorStatusPromise = loadGeneratorStatus();
    const sculptureRegistry = await loadSculptureRegistry();
    sculptureSelect.replaceChildren(
      ...sculptureRegistry.sculptures.map(
        (entry) => new Option(entry.name, entry.source),
      ),
      new Option("Custom JSON URL…", ""),
    );
    sculptureJsonInput.value = initialSculptureSource;
    sculptureSelect.value = sculptureRegistry.sculptures.some(
      (entry) => entry.source === initialSculptureSource,
    )
      ? initialSculptureSource
      : "";

    let loadedSculpture = await loadSculptureContract(
      initialSculptureSource,
    );
    let editorDefinition = loadedSculpture.definition;
    let editorProject = loadedSculpture.project;
    let selectedHardwareContract = loadedSculpture.contract;
    let hardwareContract = selectedHardwareContract;
    const engine = await WledEngine.create(
      hardwareContract.mapping.entries.length,
    );
    let wiringPreview = hardwareContract.wiring;
    let mapping = hardwareContract.mapping;
    let routeEditorModel: WiringRouteEditorModel | null =
      createWiringRouteEditorModel(editorDefinition, wiringPreview);
    renderer = new SphereRenderer(viewerElement, mapping);
    renderer.setPanelProfileThickness(
      editorProject.panelProfile.dimensions.thickness,
    );
    renderer.setShellTransparency(
      DEFAULT_SHELL_TRANSPARENCY,
    );
    renderer.setWiringPreview(wiringPreview);

    effectSelect.replaceChildren(
      ...engine.effects.map(
        ({ id, name }) => new Option(name, String(id), id === 8, id === 8),
      ),
    );
    paletteSelect.replaceChildren(
      ...engine.palettes.map(
        ({ id, name }) => new Option(name, String(id), id === 6, id === 6),
      ),
    );

    engine.setEffect(8);
    engine.setPalette(6);
    engine.setSpeed(128);
    engine.setIntensity(128);
    engine.setPrimaryColor(DEFAULT_PRIMARY_COLOR);
    engine.setSecondaryColor(DEFAULT_SECONDARY_COLOR);

    engineStatus.textContent = `${engine.effects.length} WLED effects ready`;

    let simulationTime = 0;
    let previousTime = performance.now();
    let fpsWindowStart = previousTime;
    let fpsFrames = 0;
    let currentDisplayMode: DisplayMode = "wled";
    let activePlacementSurface: {
      surface: LoadedDesignSurface;
      attachmentSurface: "design-surface" | "mechanical-shell";
    } | undefined;
    let verifiedGeneratedMechanics: VerifiedGeneratedMechanics | undefined;
    let generatedAssetLoadRevision = 0;
    let activePortableBundle: PortableProjectBundle | undefined;
    let availableProjectAssets = new Map<string, Uint8Array>();
    let generatedMemoryUrls = new Map<string, string>();
    let selectedEditorPanelId: string | null = null;

    const replacePortableBundle = (
      bundle?: PortableProjectBundle,
    ): void => {
      activePortableBundle?.dispose();
      activePortableBundle = bundle;
      availableProjectAssets = new Map(
        bundle
          ? [...bundle.assets].map(([source, asset]) => [
              source,
              Uint8Array.from(asset.bytes),
            ])
          : [],
      );
    };

    const rememberProjectAsset = (
      source: string,
      bytes: Uint8Array,
    ): void => {
      availableProjectAssets.set(source, Uint8Array.from(bytes));
    };

    const resetTimeline = (): void => {
      simulationTime = 0;
      engine.reset();
      engine.tick(0);
    };

    const mechanicalShellIsCurrent = (): boolean =>
      editorDefinition.mechanicalShell !== undefined &&
      editorDefinition.mechanicalShell.derivationStatus !==
        "requires-regeneration";

    const updatePipelineAvailability = (): void => {
      const capabilities = deriveEditorCapabilities(
        editorDefinition, activePlacementSurface !== undefined, pipelineAvailable,
      );
      renderer?.setEditorCapabilities(capabilities);
      generateMappingButton.disabled =
        mapping.topology !== "panelized-sculpture" ||
        !capabilities.canExportMappingAndWiring;
      openWiringManualButton.disabled =
        mapping.topology !== "panelized-sculpture";
      openWiringManualButton.title = !hardwareContract.readiness.mappingReady
        ? "Download the current draft wiring suggestion as a labelled printable manual."
        : "Download the current project as a self-contained A4 landscape wiring manual.";
      const packageIsCurrent = verifiedGeneratedMechanics !== undefined;
      assemblyPackageButton.textContent = packageIsCurrent
        ? "Download assembly package"
        : "Build assembly package";
      assemblyPackageButton.disabled = mapping.topology !== "panelized-sculpture" ||
        (!packageIsCurrent && !capabilities.canGenerateGenericMechanics);
      assemblyPackageButton.title = packageIsCurrent
        ? "Download the current project, verified geometry, manual, ledmap, and wiring review."
        : "Build current boundary and part STLs. The button changes to Download when they are verified.";
      automaticPanelPlacementControls.hidden = false;
      automaticallyPlacePanelsButton.disabled =
        !capabilities.canAutomaticallySeed;
      automaticallyPlacePanelsButton.title = activePlacementSurface
          ? "Seed panels evenly across the active placement surface."
          : "Load a GLB or sculpture JSON shell first.";
    };

    const renderOutputLayerControls = (): void => {
      const controls = wiringPreview.outputs.map((output) => {
        const label = document.createElement("label");
        label.className = "output-layer";
        label.style.setProperty("--output-color", output.cssColor);
        const input = document.createElement("input");
        input.className = "output-layer-toggle";
        input.dataset.outputIndex = String(output.outputIndex);
        input.type = "checkbox";
        input.checked = true;
        input.addEventListener("change", () => {
          renderer?.setOutputVisible(output.outputIndex, input.checked);
        });
        const swatch = document.createElement("span");
        swatch.className = "output-swatch";
        const name = document.createElement("span");
        name.textContent = output.label;
        const count = document.createElement("small");
        count.textContent = output.panelIds.length + " panels";
        label.append(input, swatch, name, count);
        return label;
      });
      outputLayerList.replaceChildren(...controls);
      outputLayerToggles = controls.map(
        (label) => label.querySelector<HTMLInputElement>("input")!,
      );
    };

    const renderRouteEditor = (): void => {
      const isPanelized = mapping.topology === "panelized-sculpture";
      routeEditorSection.hidden = !isPanelized;
      if (!isPanelized || !routeEditorModel) {
        routeEditor.replaceChildren();
        routeEditorNote.textContent = "A panelized sculpture is required for route editing.";
        routeActionButton.hidden = true;
        routeActionButton.disabled = true;
        routeEditorStatus.textContent = "No panel route is available.";
        return;
      }
      const model = routeEditorModel;
      const validation = validateWiringRouteEditorModel(
        editorDefinition,
        model,
      );
      const isDraftSuggestion = !model.copiedDraftSuggestion;
      const sourceLabel = model.source === "temporary-draft-suggestion"
        ? "The shown route is a temporary draft suggestion. The saved route evidence is below."
        : model.source === "draft-suggestion"
          ? "The shown route is a draft suggestion. Choose Edit suggested route before changing it."
          : wiringPreview.status === "measured"
            ? "This is the saved measured route. Saving a new authored revision removes the old measurement approval."
            : editorDefinition.wiring.routeRevision === undefined
              ? "This saved route has no revision. Review it, then choose Save route."
              : wiringPreview.status === "requires-review"
                ? "This saved route requires review. Save it only after its order matches the sculpture."
                : "This is the saved authored route. Edit it, then save a new route revision.";
      routeEditorNote.textContent = sourceLabel;
      routeActionButton.hidden = false;
      routeActionButton.textContent = isDraftSuggestion
        ? "Edit suggested route"
        : "Save route";
      routeActionButton.disabled = !isDraftSuggestion && !validation.valid;
      routeEditorStatus.classList.toggle("route-editor-status--error", !validation.valid);
      routeEditorStatus.textContent = validation.valid
        ? isDraftSuggestion
          ? "Review the suggestion, then choose Edit suggested route."
          : `Route is complete. Save route revision ${(editorDefinition.wiring.routeRevision ?? 0) + 1}.`
        : validation.errors[0]!;

      const nodeById = new Map(wiringPreview.nodes.map((node) => [node.panelId, node]));
      const outputFields = model.outputs.map((output) => {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "route-output";
        fieldset.dataset.outputIndex = String(output.outputIndex);
        const legend = document.createElement("legend");
        legend.textContent = `${output.label} · GPIO ${output.gpio ?? "unknown"} · ${output.panelIds.length} panels`;
        fieldset.append(legend);
        const list = document.createElement("ol");
        list.className = "route-output__list";
        output.panelIds.forEach((panelId, chainPosition) => {
          const item = document.createElement("li");
          item.className = "route-panel";
          item.dataset.panelId = panelId;
          item.dataset.outputIndex = String(output.outputIndex);
          item.draggable = !isDraftSuggestion;
          item.tabIndex = 0;
          item.setAttribute("aria-label", `Select panel ${panelId}; drag to reorder`);
          item.classList.toggle(
            "route-panel--selected",
            selectedEditorPanelId === panelId,
          );
          const node = nodeById.get(panelId);
          const previousPanelId = output.panelIds[chainPosition - 1] ?? null;
          const nextPanelId = output.panelIds[chainPosition + 1] ?? null;
          const detail = document.createElement("div");
          detail.className = "route-panel__detail";
          const heading = document.createElement("strong");
          heading.textContent = `${chainPosition + 1} / ${output.panelIds.length}. ${panelId}`;
          const direction = document.createElement("small");
          const din = node?.dinCorner ?? "DIN";
          const dout = node?.doutCorner ?? "DOUT";
          direction.textContent = `${previousPanelId ? `${previousPanelId} DOUT` : "Controller"} → ${panelId} DIN ${din}; ${panelId} DOUT ${dout} → ${nextPanelId ? `${nextPanelId} DIN` : "output end"}.`;
          detail.append(heading, direction);
          const dragHandle = document.createElement("span");
          dragHandle.className = "route-panel__drag";
          dragHandle.textContent = isDraftSuggestion ? "Locked" : "Drag";
          dragHandle.setAttribute("aria-hidden", "true");
          const assignment = document.createElement("label");
          assignment.className = "route-panel__assignment";
          assignment.textContent = "Output ";
          const outputSelect = document.createElement("select");
          outputSelect.setAttribute("aria-label", `Assign ${panelId} to controller output`);
          outputSelect.disabled = isDraftSuggestion;
          outputSelect.append(...model.outputs.map((candidate) => new Option(
            `${candidate.label} (GPIO ${candidate.gpio ?? "unknown"})`,
            String(candidate.outputIndex),
            candidate.outputIndex === output.outputIndex,
            candidate.outputIndex === output.outputIndex,
          )));
          outputSelect.addEventListener("change", () => {
            routeEditorModel = moveRoutePanelToOutput(
              model, panelId, Number(outputSelect.value),
            );
            renderRouteEditor();
          });
          outputSelect.addEventListener("click", (event) => event.stopPropagation());
          assignment.append(outputSelect);
          item.addEventListener("click", () => {
            renderer?.selectEditorPanel(panelId);
          });
          item.addEventListener("keydown", (event) => {
            if (event.target !== item) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              renderer?.selectEditorPanel(panelId);
              return;
            }
            if (
              !isDraftSuggestion && event.altKey &&
              (event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
              event.preventDefault();
              const destinationIndex = chainPosition +
                (event.key === "ArrowUp" ? -1 : 2);
              routeEditorModel = moveRoutePanelToPosition(
                model,
                panelId,
                output.outputIndex,
                destinationIndex,
              );
              renderRouteEditor();
            }
          });
          item.addEventListener("dragstart", (event) => {
            if (isDraftSuggestion || !event.dataTransfer) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", panelId);
            item.classList.add("route-panel--dragging");
          });
          item.addEventListener("dragend", () => {
            item.classList.remove("route-panel--dragging");
          });
          item.addEventListener("dragover", (event) => {
            if (!isDraftSuggestion) event.preventDefault();
          });
          item.addEventListener("drop", (event) => {
            if (isDraftSuggestion) return;
            event.preventDefault();
            event.stopPropagation();
            const draggedPanelId = event.dataTransfer?.getData("text/plain");
            if (!draggedPanelId) return;
            routeEditorModel = moveRoutePanelToPosition(
              model,
              draggedPanelId,
              output.outputIndex,
              chainPosition,
            );
            renderRouteEditor();
          });
          item.append(dragHandle, detail, assignment);
          list.append(item);
        });
        list.addEventListener("dragover", (event) => {
          if (!isDraftSuggestion) event.preventDefault();
        });
        list.addEventListener("drop", (event) => {
          if (isDraftSuggestion || event.target !== list) return;
          event.preventDefault();
          const panelId = event.dataTransfer?.getData("text/plain");
          if (!panelId) return;
          routeEditorModel = moveRoutePanelToPosition(
            model,
            panelId,
            output.outputIndex,
            output.panelIds.length,
          );
          renderRouteEditor();
        });
        fieldset.append(list);
        return fieldset;
      });
      if (
        wiringPreview.routeSource === "temporary-draft-suggestion" &&
        wiringPreview.savedOutputPanelIds
      ) {
        const evidence = document.createElement("div");
        evidence.className = "route-editor__evidence";
        const heading = document.createElement("strong");
        heading.textContent = "Saved route evidence requiring review";
        const lines = document.createElement("ul");
        for (const output of wiringPreview.savedOutputPanelIds) {
          const line = document.createElement("li");
          line.textContent = `Output ${output.outputIndex + 1}: ${output.panelIds.join(" → ")}`;
          lines.append(line);
        }
        evidence.append(heading, lines);
        routeEditor.replaceChildren(...outputFields, evidence);
      } else {
        routeEditor.replaceChildren(...outputFields);
      }
    };

    const updateMappingStatus = (): void => {
      const validation = validateMapping(mapping, engine.ledCount);
      const isPanelized = mapping.topology === "panelized-sculpture";
      const generatedState = getGeneratedMechanicsState(
        editorDefinition,
        editorProject.panelProfile,
      );
      const wiringValidation = isPanelized
        ? validateWiringPreview(wiringPreview, mapping)
        : { valid: true, errors: [] };
      const ledmapErrors = isPanelized
        ? validateLedmapEquivalence(mapping, hardwareContract.ledmap)
        : [];
      const allValid =
        validation.valid &&
        wiringValidation.valid &&
        ledmapErrors.length === 0;
      mappingStatus.classList.toggle("validation-row--error", !allValid);
      const validSummary = isPanelized
        ? mapping.panels.length +
          " panels / " +
          mapping.entries.length.toLocaleString() + " LEDs / " +
          wiringPreview.outputs.length + " routes valid"
        : "Fallback mapping is valid";
      mappingStatus.innerHTML = allValid
        ? `<span class="validation-icon">✓</span><span>${validSummary}</span>`
        : `<span class="validation-icon">!</span><span>${validation.errors[0] ?? wiringValidation.errors[0] ?? ledmapErrors[0] ?? "Invalid mapping"}</span>`;
      panelCountDisplay.textContent = isPanelized
        ? String(mapping.panels.length)
        : "—";
      const mechanicalNote = editorDefinition.mechanicalShell && !mechanicalShellIsCurrent()
          ? "Panel poses changed on an authoring surface. Wiring preview follows those poses; printable closures are hidden until the mechanical shell is regenerated."
        : generatedState === "stale"
          ? "Mapping and wiring follow the edited poses. The last generated STL set is stale and hidden until regeneration succeeds."
        : verifiedGeneratedMechanics
          ? `Mapping and wiring use authoritative poses. Three.js and downloads use the same SHA-256-verified STL bytes (${verifiedGeneratedMechanics.parts.length} parts).`
        : editorDefinition.boundaryTopology
          ? "Mapping and wiring use authoritative poses. Build assembly package validates the accepted gap cycles before creating printable material."
        : !editorDefinition.mechanicalShell
          ? "Mapping and wiring use authoritative poses. No printable mechanics exist yet; the complete pose-first interface remains available."
        : "Custom LED counts use the panel-free Fibonacci fallback.";
      const routeLifecycleNote = !isPanelized
        ? ""
        : hardwareContract.readiness.mappingReady
          ? `Simulator and ledmap share mapping-ready ${wiringPreview.status.replace("-", " ")} route ${hardwareContract.fingerprint}. Electrical approval remains separate.`
        : hardwareContract.readiness.ready
          ? wiringPreview.status === "hardware-verified"
            ? `Simulator and ledmap share hardware-verified route ${hardwareContract.fingerprint}.`
            : `Simulator and ledmap share measured route ${hardwareContract.fingerprint}; PROOF-010 hardware verification remains separate.`
          : `Simulator and ledmap share a ${wiringPreview.status.replace("-", " ")} route ${hardwareContract.fingerprint}. Hardware export is blocked until ${hardwareContract.readiness.blockers.length} readiness requirements are resolved.`;
      mappingNote.textContent = routeLifecycleNote
        ? mechanicalNote + " " + routeLifecycleNote
        : mechanicalNote;
      panelLabelsToggle.disabled = !isPanelized;
      const hasPrintableClosures =
        isPanelized && (verifiedGeneratedMechanics !== undefined ||
          (mechanicalShellIsCurrent() &&
            (mapping.printableClosures?.length ?? 0) > 0));
      printableLayerToggle.disabled = !hasPrintableClosures;
      connectorLayerToggle.disabled = !isPanelized;
      wiringLayerToggle.disabled = !isPanelized;
      wiringLayerControls.classList.toggle(
        "layer-controls--disabled",
        !isPanelized,
      );
      for (const toggle of outputLayerToggles) {
        toggle.disabled = !isPanelized;
      }
      renderer?.setPanelLabelsVisible(isPanelized && panelLabelsToggle.checked);
      renderer?.setPrintableLayerVisible(
        hasPrintableClosures && printableLayerToggle.checked,
      );
      renderer?.setConnectorLayerVisible(
        isPanelized && connectorLayerToggle.checked,
      );
      renderer?.setWiringLayerVisible(
        isPanelized && wiringLayerToggle.checked,
      );
      updatePipelineAvailability();
    };

    const restoreGeneratedMechanics = async (
      selected: LoadedSculpture,
    ): Promise<void> => {
      const revision = ++generatedAssetLoadRevision;
      verifiedGeneratedMechanics = undefined;
      renderer?.setExactGeneratedMechanics(null);
      const state = getGeneratedMechanicsState(
        selected.definition,
        selected.project.panelProfile,
      );
      if (state !== "current") {
        updateMappingStatus();
        return;
      }
      try {
        if (!selected.definition.boundaryTopology) {
          throw new Error(
            "Exact generated assets require their panel-outline boundary topology.",
          );
        }
        const boundary = generateClosedPanelBoundary(
          selected.definition,
          selected.project.panelProfile,
        );
        const assets = await loadVerifiedGeneratedMechanics(
          selected.definition,
          selected.project.panelProfile,
          selected.project.source,
          fetch,
          document.baseURI,
          selected.project.source.startsWith("local:") || generatedMemoryUrls.size > 0
            ? new Map([
              ...(activePortableBundle?.assetUrls ?? []),
              ...generatedMemoryUrls,
            ])
            : undefined,
        );
        if (revision !== generatedAssetLoadRevision || !assets) return;
        rememberProjectAsset(assets.boundary.source, assets.boundary.bytes);
        for (const part of assets.parts) {
          rememberProjectAsset(part.source, part.bytes);
        }
        renderer?.setExactGeneratedMechanics(boundary, assets);
        verifiedGeneratedMechanics = assets;
        updateMappingStatus();
      } catch (error) {
        if (revision !== generatedAssetLoadRevision) return;
        const message = error instanceof Error ? error.message : String(error);
        pipelineStatus.classList.add("pipeline-status--error");
        pipelineStatus.textContent = message;
        viewerError.hidden = false;
        viewerError.textContent = message;
        updateMappingStatus();
      }
    };

    const renderEditorFaces = (): void => {
      const options = mechanicalShellIsCurrent() && editorDefinition.closures
        ? editorDefinition.closures.faceIds.flatMap((faceId) => {
        try {
          addPanelToClosureFace(
            editorDefinition,
            faceId,
            editorProject.panelProfile.dimensions,
          );
          return [new Option(faceId, faceId)];
        } catch {
          return [];
        }
      })
        : [];
      addPanelFaceSelect.replaceChildren(
        ...(options.length > 0
          ? [new Option("Choose a closure face…", "", true, true), ...options]
          : [new Option("No closure faces available", "")]),
      );
      addPanelControls.hidden = options.length === 0;
      addPanelButton.hidden = true;
      addPanelButton.disabled = true;
    };

    const applyLoadedSculpture = (
      selected: LoadedSculpture,
      preserveEditorDefinition = false,
    ): Promise<void> => {
      loadedSculpture = selected;
      selectedHardwareContract = selected.contract;
      hardwareContract = selectedHardwareContract;
      mapping = selected.contract.mapping;
      wiringPreview = selected.contract.wiring;
      if (!preserveEditorDefinition) {
        editorDefinition = selected.definition;
        editorProject = selected.project;
        automaticPanelCountInput.min = String(editorDefinition.panels.length);
        if (Number(automaticPanelCountInput.value) < editorDefinition.panels.length) {
          automaticPanelCountInput.value = String(editorDefinition.panels.length);
        }
        renderEditorFaces();
      }
      routeEditorModel = createWiringRouteEditorModel(
        editorDefinition,
        wiringPreview,
      );
      engine.resize(mapping.entries.length);
      ledCountInput.value = String(mapping.entries.length);
      ledCountDisplay.textContent = mapping.entries.length.toLocaleString();
      renderer?.setPanelProfileThickness(
        selected.project.panelProfile.dimensions.thickness,
      );
      renderer?.setMapping(mapping);
      renderer?.setWiringPreview(wiringPreview);
      renderOutputLayerControls();
      renderRouteEditor();
      resetTimeline();
      updateMappingStatus();
      return restoreGeneratedMechanics(selected);
    };

    const clearDesignSurface = (message: string): void => {
      activePlacementSurface = undefined;
      automaticallyPlacePanelsButton.disabled = true;
      renderer?.setDesignSurface(null);
      surfaceStatus.textContent = message;
      selectedPanelStatus.textContent =
        "No authoring surface loaded. Existing panels can still be selected, moved in their local plane, rotated, or deleted.";
      updatePipelineAvailability();
    };

    const showDesignSurface = (
      surface: LoadedDesignSurface,
      source: string,
      attachmentSurface: "design-surface" | "mechanical-shell" =
        "design-surface",
    ): void => {
      activePlacementSurface = { surface, attachmentSurface };
      renderer?.setDesignSurface(surface.geometry, attachmentSurface);
      updatePipelineAvailability();
      autoRotate.checked = false;
      renderer?.setAutoRotate(false);
      const size = surface.validation.bounds.size
        .map((value) => Math.round(value))
        .join(" × ");
      surfaceStatus.textContent =
        source +
        ": " +
        surface.validation.triangleCount.toLocaleString() +
        " triangles, " +
        size +
        " mm, watertight.";
      selectedPanelStatus.textContent = "";
    };

    const showMechanicalShellSurface = (message?: string): void => {
      if (!editorDefinition.mechanicalShell) {
        throw new Error("This project has no JSON mechanical-shell placement surface.");
      }
      const surface = loadMechanicalShellDesignSurface(editorDefinition);
      showDesignSurface(surface, "sculpture JSON face graph", "mechanical-shell");
      if (message) surfaceStatus.textContent = message;
    };

    const loadReferencedDesignSurface = async (): Promise<void> => {
      const definition = editorDefinition.designSurface;
      if (!definition) {
        if (editorDefinition.mechanicalShell) {
          showMechanicalShellSurface();
        } else {
          clearDesignSurface(
            "No authoring surface is referenced. The pose-first project is fully usable; load a GLB to place panels on a surface.",
          );
        }
        return;
      }
      surfaceScaleInput.value = String(definition.scaleToMillimeters);
      const bundledSurface = activePortableBundle?.assets.get(definition.source);
      const surfaceObjectUrl = bundledSurface?.sha256 === definition.sha256
        ? bundledSurface.objectUrl
        : undefined;
      if (editorProject.source.startsWith("local:") && !surfaceObjectUrl) {
        if (editorDefinition.mechanicalShell) {
          showMechanicalShellSurface(
            "Using the JSON face graph. This project references " +
              definition.source +
              "; load that companion GLB to use its higher-resolution surface.",
          );
        } else {
          clearDesignSurface(
            "This local pose-first project references " + definition.source +
              "; load that companion GLB to restore surface placement. All saved panel poses remain available.",
          );
        }
        return;
      }
      clearDesignSurface("Loading referenced GLB " + definition.source + "…");
      try {
        const surfaceUrl = surfaceObjectUrl ?? new URL(
          definition.source,
          new URL(editorProject.source, document.baseURI),
        );
        const response = await fetch(surfaceUrl);
        if (!response.ok) {
          throw new Error(
            "Unable to load design-surface GLB: HTTP " + response.status + ".",
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const surface = await loadGlbDesignSurface(
          bytes.slice().buffer,
          definition.scaleToMillimeters,
        );
        if (surface.sha256.toLowerCase() !== definition.sha256.toLowerCase()) {
          surface.geometry.dispose();
          throw new Error("The referenced GLB does not match its sculpture JSON SHA-256.");
        }
        rememberProjectAsset(definition.source, bytes);
        showDesignSurface(surface, definition.source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (editorDefinition.mechanicalShell) {
          showMechanicalShellSurface(
            `${message} Using the JSON face graph instead; saved panel poses remain authoritative.`,
          );
        } else {
          clearDesignSurface(
            `${message} The pose-first project remains loaded; saved panels, simulation, mapping, wiring, and JSON save are still available.`,
          );
        }
      }
    };

    renderer?.setSurfaceEditorCallbacks({
      onSelectionChange: (panelId) => {
        selectedEditorPanelId = panelId;
        for (const row of routeEditor.querySelectorAll<HTMLElement>(".route-panel")) {
          row.classList.toggle(
            "route-panel--selected",
            row.dataset.panelId === panelId,
          );
        }
        const capabilities = deriveEditorCapabilities(
          editorDefinition, activePlacementSurface !== undefined, pipelineAvailable,
        );
        if (panelId) {
          const moveMode = capabilities.canTranslateOnActiveSurface
            ? "move across the active surface"
            : capabilities.canTranslateInPanelPlane
              ? "move in its saved local plane"
              : "";
          const actions = [
            moveMode,
            capabilities.canRotateSelectedPanel ? "rotate around local Z" : "",
            capabilities.canDeleteSelectedPanel ? "delete" : "",
          ].filter(Boolean);
          selectedPanelStatus.textContent =
            "Selected " + panelId + ". Available: " + actions.join(", ") + ".";
        } else {
          selectedPanelStatus.textContent = "";
        }
      },
      onPlacementCommit: (placement) => {
        try {
          const edited = movePanelOnDesignSurface(
            editorDefinition,
            placement.panelId,
            placement,
          );
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent = edited.mechanicalShell
              ? "Moved " + placement.panelId + ". Pose is saved; 3D generation will validate it against the JSON boundary and regenerate printable mechanics."
              : "Moved " + placement.panelId + ". Mapping and wiring refreshed; no printable mechanics exist yet.";
          selectedPanelStatus.textContent =
            placement.panelId + " is attached to triangle " +
            placement.attachment.triangleIndex + ".";
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      },
      onLocalTranslationCommit: (panelId, deltaX, deltaY) => {
        try {
          const edited = movePanelInLocalPlane(
            editorDefinition, panelId, deltaX, deltaY,
          );
          const project = createPanelAssemblyProject(
            edited, editorProject.source, editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          renderer?.selectEditorPanel(panelId);
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent = edited.mechanicalShell
              ? "Moved " + panelId + " in its saved panel plane. Mapping and wiring refreshed; generated mechanics require regeneration."
              : "Moved " + panelId + " in its saved panel plane. Mapping and wiring refreshed; no printable mechanics exist yet.";
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      },
      onRotationCommit: (panelId, degrees) => {
        try {
          const edited = rotatePanelAroundLocalZ(
            editorDefinition,
            panelId,
            degrees,
          );
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          renderer?.selectEditorPanel(panelId);
          const direction = degrees >= 0 ? "counter-clockwise" : "clockwise";
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent = edited.mechanicalShell
              ? "Rotated " + panelId + " " + Math.abs(degrees).toFixed(1) + "° " + direction + " as viewed from outside. 3D generation will revalidate its full PCB envelope."
              : "Rotated " + panelId + " " + Math.abs(degrees).toFixed(1) + "° " + direction + " as viewed from outside. Mapping and wiring refreshed; no printable mechanics exist yet.";
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      },
      onAddPanelCommit: (placement) => {
        try {
          const edited = addPanelOnDesignSurface(editorDefinition, placement);
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          const panelId = edited.panels.at(-1)!.id;
          renderer?.selectEditorPanel(panelId);
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent = editorDefinition.mechanicalShell
            ? `Added ${panelId} on canvas triangle ${placement.attachment.triangleIndex}. 3D generation will regenerate from the JSON mechanical boundary.`
            : `Added ${panelId} on canvas triangle ${placement.attachment.triangleIndex}. Mapping and wiring refreshed; no printable mechanics exist yet.`;
          selectedPanelStatus.textContent =
            `${panelId} was added and can now be dragged across the surface.`;
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      },
      onDeletePanelRequest: (panelId) => {
        try {
          const edited = deletePanel(editorDefinition, panelId);
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent = edited.mechanicalShell
              ? "Deleted " + panelId + ". 3D generation will regenerate the closed JSON mechanical boundary."
              : "Deleted " + panelId + ". Mapping and wiring refreshed; no printable mechanics exist yet.";
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      },
    });

    effectSelect.addEventListener("change", () => {
      engine.setEffect(Number(effectSelect.value));
      resetTimeline();
    });
    paletteSelect.addEventListener("change", () => {
      engine.setPalette(Number(paletteSelect.value));
    });
    speedInput.addEventListener("input", () => {
      speedValue.value = speedInput.value;
      engine.setSpeed(Number(speedInput.value));
    });
    intensityInput.addEventListener("input", () => {
      intensityValue.value = intensityInput.value;
      engine.setIntensity(Number(intensityInput.value));
    });
    displayMode.addEventListener("change", () => {
      currentDisplayMode = displayMode.value as DisplayMode;
    });
    autoRotate.addEventListener("change", () =>
      renderer?.setAutoRotate(autoRotate.checked),
    );
    panelLabelsToggle.addEventListener("change", () => {
      renderer?.setPanelLabelsVisible(
        mapping.topology === "panelized-sculpture" && panelLabelsToggle.checked,
      );
    });
    printableLayerToggle.addEventListener("change", () => {
      renderer?.setPrintableLayerVisible(printableLayerToggle.checked);
    });
    connectorLayerToggle.addEventListener("change", () => {
      renderer?.setConnectorLayerVisible(connectorLayerToggle.checked);
    });
    wiringLayerToggle.addEventListener("change", () => {
      renderer?.setWiringLayerVisible(wiringLayerToggle.checked);
    });
    routeActionButton.addEventListener("click", () => {
      void (async () => {
        try {
          if (!routeEditorModel) {
            throw new Error("A panelized wiring route is unavailable.");
          }
          if (!routeEditorModel.copiedDraftSuggestion) {
            routeEditorModel = copyDraftSuggestionToRouteEditor(routeEditorModel);
            renderRouteEditor();
            routeEditorStatus.textContent =
              "Route editing is active. Drag rows into order, then choose Save route.";
            return;
          }
          const edited = confirmWiringRouteEditorModel(
            editorDefinition,
            routeEditorModel,
          );
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          await applyLoadedSculpture(createLoadedSculpture(project));
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent =
            `Saved wiring route revision ${edited.wiring.routeRevision}. Save the project ZIP to keep it.`;
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        }
      })();
    });
    const loadSelectedSculpture = async (): Promise<void> => {
      const source = sculptureJsonInput.value.trim();
      if (!source) {
        sculptureJsonInput.setCustomValidity("Enter a sculpture JSON URL.");
        sculptureJsonInput.reportValidity();
        return;
      }
      sculptureJsonInput.setCustomValidity("");
      loadSculptureButton.disabled = true;
      try {
        const selected = await loadSculptureContract(source);
        replacePortableBundle();
        await applyLoadedSculpture(selected);
        await loadReferencedDesignSurface();
        sculptureSelect.value = sculptureRegistry.sculptures.some(
          (entry) => entry.source === source,
        )
          ? source
          : "";
        const url = new URL(window.location.href);
        url.searchParams.set("sculptureJson", source);
        window.history.replaceState(null, "", url);
        viewerError.hidden = true;
      } catch (error) {
        viewerError.hidden = false;
        viewerError.textContent =
          error instanceof Error ? error.message : String(error);
      } finally {
        loadSculptureButton.disabled = false;
      }
    };
    sculptureSelect.addEventListener("change", () => {
      if (!sculptureSelect.value) {
        advancedTools.open = true;
        sculptureJsonInput.focus();
        return;
      }
      sculptureJsonInput.value = sculptureSelect.value;
      void loadSelectedSculpture();
    });
    loadSculptureButton.addEventListener("click", () => {
      void loadSelectedSculpture();
    });
    sculptureJsonInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void loadSelectedSculpture();
    });
    applyCountButton.addEventListener("click", () => {
      const requested = Number(ledCountInput.value);
      if (!Number.isInteger(requested) || requested < 64 || requested > 200000) {
        ledCountInput.setCustomValidity("Choose an integer from 64 to 200,000.");
        ledCountInput.reportValidity();
        return;
      }
      ledCountInput.setCustomValidity("");
      engine.resize(requested);
      if (requested === selectedHardwareContract.mapping.entries.length) {
        hardwareContract = selectedHardwareContract;
        mapping = hardwareContract.mapping;
        wiringPreview = hardwareContract.wiring;
      } else {
        mapping = createUniformSphereMapping(requested);
        wiringPreview = createProvisionalWiringPreview(mapping);
      }
      renderer?.setMapping(mapping);
      renderer?.setWiringPreview(wiringPreview);
      routeEditorModel = createWiringRouteEditorModel(
        editorDefinition,
        wiringPreview,
      );
      renderOutputLayerControls();
      renderRouteEditor();
      resetTimeline();
      ledCountDisplay.textContent = requested.toLocaleString();
      updateMappingStatus();
    });
    const applyPortableBundle = async (
      bundle: PortableProjectBundle,
      label: string,
    ): Promise<void> => {
      const selected = createLoadedSculpture(bundle.project);
      replacePortableBundle(bundle);
      await applyLoadedSculpture(selected);
      await loadReferencedDesignSurface();
      sculptureSelect.value = "";
      sculptureJsonInput.value = label;
      pipelineStatus.classList.remove("pipeline-status--error");
      pipelineStatus.textContent =
        `Loaded complete project ${label} with ${bundle.assets.size} verified assets.`;
      viewerError.hidden = true;
    };

    const reportPortableError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      pipelineStatus.classList.add("pipeline-status--error");
      pipelineStatus.textContent = message;
      viewerError.hidden = false;
      viewerError.textContent = message;
    };

    openProjectFileButton.addEventListener("click", () => {
      projectFileInput.click();
    });
    projectFileInput.addEventListener("change", () => {
      const file = projectFileInput.files?.[0];
      if (!file) return;
      void (async () => {
        openProjectFileButton.disabled = true;
        try {
          if (file.name.toLowerCase().endsWith(".zip")) {
            const bundle = await openPortableProjectZip(
              new Uint8Array(await file.arrayBuffer()),
              file.name,
              loadStagedPanelProfile,
            );
            await applyPortableBundle(bundle, file.name);
          } else {
            const selected = await loadLocalSculpture(file);
            replacePortableBundle();
            await applyLoadedSculpture(selected);
            await loadReferencedDesignSurface();
            sculptureSelect.value = "";
            sculptureJsonInput.value = file.name;
            pipelineStatus.classList.remove("pipeline-status--error");
            pipelineStatus.textContent = `Loaded ${file.name}.`;
            viewerError.hidden = true;
          }
        } catch (error) {
          reportPortableError(error);
        } finally {
          projectFileInput.value = "";
          openProjectFileButton.disabled = false;
        }
      })();
    });

    openProjectFolderButton.addEventListener("click", () => {
      projectFolderInput.click();
    });
    projectFolderInput.addEventListener("change", () => {
      const files = [...(projectFolderInput.files ?? [])];
      if (files.length === 0) return;
      void (async () => {
        openProjectFolderButton.disabled = true;
        try {
          const entries: PortableProjectFile[] = await Promise.all(
            files.map(async (file) => ({
              path: file.webkitRelativePath || file.name,
              bytes: new Uint8Array(await file.arrayBuffer()),
            })),
          );
          const label = files[0]!.webkitRelativePath.split("/")[0] ||
            "project-folder";
          const bundle = await openPortableProjectFiles(
            entries,
            label,
            loadStagedPanelProfile,
          );
          await applyPortableBundle(bundle, label);
        } catch (error) {
          reportPortableError(error);
        } finally {
          projectFolderInput.value = "";
          openProjectFolderButton.disabled = false;
        }
      })();
    });

    saveProjectButton.addEventListener("click", () => {
      try {
        const folderName = portableProjectFolderName(editorDefinition);
        const bytes = createPortableProjectZip(
          editorDefinition,
          availableProjectAssets,
          folderName,
        );
        const objectUrl = URL.createObjectURL(new Blob(
          [Uint8Array.from(bytes)],
          { type: "application/zip" },
        ));
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${folderName}.zip`;
        link.click();
        URL.revokeObjectURL(objectUrl);
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent =
          `Exported ${link.download} from verified in-memory project assets.`;
        viewerError.hidden = true;
      } catch (error) {
        reportPortableError(error);
      }
    });

    exportProjectFolderButton.addEventListener("click", () => {
      void (async () => {
        exportProjectFolderButton.disabled = true;
        try {
          const picker = (window as unknown as {
            showDirectoryPicker?: () => Promise<PortableDirectoryHandle>;
          }).showDirectoryPicker;
          if (!picker) {
            throw new Error(
              "Folder export needs a browser with the directory picker; use project ZIP export here.",
            );
          }
          const folderName = portableProjectFolderName(editorDefinition);
          const parent = await picker.call(window);
          await writePortableProjectFolder(
            parent,
            editorDefinition,
            availableProjectAssets,
            folderName,
          );
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent =
            `Exported complete project folder ${folderName}.`;
          viewerError.hidden = true;
        } catch (error) {
          reportPortableError(error);
        } finally {
          exportProjectFolderButton.disabled = false;
        }
      })();
    });

    loadDesignSurfaceButton.addEventListener("click", () => {
      designSurfaceFileInput.click();
    });
    designSurfaceFileInput.addEventListener("change", () => {
      const file = designSurfaceFileInput.files?.[0];
      if (!file) return;
      void (async () => {
        loadDesignSurfaceButton.disabled = true;
        try {
          const scaleToMillimeters = Number(surfaceScaleInput.value);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const surface = await loadGlbDesignSurface(
            bytes.slice().buffer,
            scaleToMillimeters,
          );
          const edited = structuredClone(editorDefinition);
          edited.designSurface = {
            kind: "triangle-mesh",
            format: "glb",
            source: file.name,
            sha256: surface.sha256,
            scaleToMillimeters,
            status: "watertight",
          };
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          rememberProjectAsset(file.name, bytes);
          showDesignSurface(surface, file.name);
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent =
            "Attached " + file.name +
            " to the sculpture JSON. Export a project folder or ZIP to preserve every referenced file.";
          viewerError.hidden = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        } finally {
          designSurfaceFileInput.value = "";
          loadDesignSurfaceButton.disabled = false;
        }
      })();
    });
    saveSculptureFileButton.addEventListener("click", () => {
      const blob = new Blob([sculptureJson(editorDefinition)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${editorDefinition.id}.sculpture.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      pipelineStatus.textContent = `Saved ${link.download}.`;
    });

    automaticallyPlacePanelsButton.addEventListener("click", () => {
      try {
        if (!activePlacementSurface) {
          throw new Error("Load a GLB or sculpture JSON shell first.");
        }
        const targetPanelCount = Number(automaticPanelCountInput.value);
        const { attachmentSurface, surface } = activePlacementSurface;
        const result = automaticallySeedPanelsOnSurface(
          editorDefinition,
          placementMeshFromSurface(surface, false),
          editorProject.panelProfile.dimensions,
          {
            targetPanelCount,
            surface: attachmentSurface,
            normalOffset: editorProject.panelProfile.dimensions.thickness / 2,
          },
        );
        const project = createPanelAssemblyProject(
          result.definition,
          editorProject.source,
          editorProject.panelProfile,
        );
        applyLoadedSculpture(createLoadedSculpture(project));
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent = result.placedPanelIds.length === 0
          ? `The sculpture already has ${targetPanelCount} panels; nothing changed.`
          : `Placed ${result.placedPanelIds.join(", ")} across the active ${
            attachmentSurface === "design-surface" ? "GLB" : "JSON shell"
          }. Mapping and provisional wiring are refreshed; adjust poses manually${
            editorDefinition.mechanicalShell
              ? " before separate 3D generation"
              : "; 3D generation remains unavailable until boundary input exists"
          }.`;
        viewerError.hidden = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pipelineStatus.classList.add("pipeline-status--error");
        pipelineStatus.textContent = message;
        viewerError.hidden = false;
        viewerError.textContent = message;
      }
    });
    addPanelButton.addEventListener("click", () => {
      try {
        const faceId = addPanelFaceSelect.value;
        if (!faceId) throw new Error("Choose an available closure face.");
        const edited = addPanelToClosureFace(
          editorDefinition,
          faceId,
          editorProject.panelProfile.dimensions,
        );
        const project = createPanelAssemblyProject(
          edited,
          editorProject.source,
          editorProject.panelProfile,
        );
        applyLoadedSculpture(createLoadedSculpture(project));
        pipelineStatus.textContent =
          `Added ${edited.panels.at(-1)!.id} to ${faceId}. Save the project ZIP or build the assembly package.`;
        viewerError.hidden = true;
      } catch (error) {
        viewerError.hidden = false;
        viewerError.textContent =
          error instanceof Error ? error.message : String(error);
      }
    });
    addPanelFaceSelect.addEventListener("change", () => {
      const hasEligibleSelection = addPanelFaceSelect.value !== "";
      addPanelButton.hidden = !hasEligibleSelection;
      addPanelButton.disabled = !hasEligibleSelection;
    });
    const downloadJson = (filename: string, value: unknown): void => {
      const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    };

    const createCurrentAssemblyManualDocument = (): string => {
      const model = createWiringAssemblyManualModel(
        editorDefinition,
        hardwareContract,
        editorProject.panelProfile,
        editorProject.source,
      );
      return renderStandaloneWiringAssemblyManualDocument(
        model,
        wiringManualStyles,
      );
    };

    openWiringManualButton.addEventListener("click", () => {
      try {
        const html = createCurrentAssemblyManualDocument();
        const objectUrl = URL.createObjectURL(new Blob([html], {
          type: "text/html;charset=utf-8",
        }));
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download =
          `${portableProjectFolderName(editorDefinition)}-assembly-manual.html`;
        link.click();
        URL.revokeObjectURL(objectUrl);
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent = `Downloaded ${link.download}.`;
        viewerError.hidden = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pipelineStatus.classList.add("pipeline-status--error");
        pipelineStatus.textContent = message;
        viewerError.hidden = false;
        viewerError.textContent = message;
      }
    });

    generateMappingButton.addEventListener("click", () => {
      try {
        if (mapping.topology !== "panelized-sculpture") {
          throw new Error("WLED mapping requires a panelized sculpture.");
        }
        const baseName = editorDefinition.id;
        downloadJson(
          `${baseName}.wled-ledmap.json`,
          hardwareContract.ledmap,
        );
        downloadJson(
          `${baseName}.${wiringPreview.status}-wiring.json`,
          createWiringReview(editorDefinition, hardwareContract, wiringPreview),
        );
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent =
          `Exported WLED ledmap and ${wiringPreview.status === "draft" ? "draft wiring review" : wiringPreview.status + " route review"} for ${mapping.entries.length.toLocaleString()} LEDs; fingerprint ${hardwareContract.fingerprint}.`;
        viewerError.hidden = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pipelineStatus.classList.add("pipeline-status--error");
        pipelineStatus.textContent = message;
        viewerError.hidden = false;
        viewerError.textContent = message;
      }
    });

    const downloadAssemblyPackage = (): void => {
      if (!verifiedGeneratedMechanics) {
        throw new Error("Build the assembly package before downloading it.");
      }
      const zipBytes = createAssemblyPackageZip(
        editorDefinition,
        availableProjectAssets,
        {
          assemblyManualHtml: createCurrentAssemblyManualDocument(),
          ledmap: hardwareContract.ledmap,
          wiringReview: createWiringReview(
            editorDefinition,
            hardwareContract,
            wiringPreview,
          ),
        },
      );
      const objectUrl = URL.createObjectURL(new Blob(
        [Uint8Array.from(zipBytes)],
        { type: "application/zip" },
      ));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        `${portableProjectFolderName(editorDefinition)}-assembly-package.zip`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      pipelineStatus.classList.remove("pipeline-status--error");
      pipelineStatus.textContent =
        `Downloaded ${link.download} with the project, verified geometry, assembly manual, ledmap, and wiring review.`;
      viewerError.hidden = true;
    };

    const buildAssemblyPackage = async (): Promise<void> => {
        assemblyPackageButton.disabled = true;
        addPanelButton.disabled = true;
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent = editorDefinition.boundaryTopology
          ? "Deriving exact panel outlines and validating flat gap caps…"
          : editorDefinition.mechanicalShell && editorDefinition.closures
            ? "Regenerating mechanical topology, then generating Manifold STLs and printable previews…"
            : "Detecting unambiguous flat gap cycles from exact panel outlines, then validating and generating printable parts…";
        try {
          try {
            const bundle = await compilePanelBoundaryBundle(
              editorProject,
              editorDefinition.panelProfile.source,
            );
            generatedMemoryUrls.forEach((url) => URL.revokeObjectURL(url));
            generatedMemoryUrls = new Map();
            for (const file of bundle.files) {
              rememberProjectAsset(file.source, file.bytes);
              generatedMemoryUrls.set(
                file.source,
                URL.createObjectURL(
                new Blob([Uint8Array.from(file.bytes)], { type: "model/stl" }),
              ),
              );
            }
            const inProcessProject = createPanelAssemblyProject(
              bundle.definition,
              "local:in-process-manifold",
              editorProject.panelProfile,
            );
            await applyLoadedSculpture(
              createLoadedSculpture(inProcessProject),
            );
            const partCount = bundle.files.filter((file) =>
              file.source.startsWith("mechanics/parts/")
            ).length;
            pipelineStatus.textContent =
              `Built and SHA-256 verified ${partCount} printable parts. The assembly package is ready to download.`;
            viewerError.hidden = true;
          } catch (inProcessError) {
            if (!shouldUseEditorPipelineFallback(inProcessError)) {
              throw inProcessError;
            }
            const response = await fetch("./api/editor-pipeline", {
            method: "POST",
            body: createEditorPipelineFormData(
              editorDefinition,
              availableProjectAssets,
            ),
          });
          const result = await readEditorPipelineResult(response);
          if (!response.ok || !result.ok || !result.assetSculptureId || !result.definition) {
            throw new Error(
              result.error ?? `Pipeline failed with HTTP ${response.status}.`,
            );
          }
          if (result.projectSource) {
            const generated = await loadSculptureContract(result.projectSource);
            await applyLoadedSculpture(generated);
            sculptureJsonInput.value = result.projectSource;
          } else {
            const regeneratedProject = createPanelAssemblyProject(
              result.definition,
              editorProject.source,
              editorProject.panelProfile,
            );
            editorDefinition = regeneratedProject.sculpture;
            editorProject = regeneratedProject;
            const previewDefinition = structuredClone(regeneratedProject.sculpture);
            previewDefinition.id = result.assetSculptureId;
            const previewProject = createPanelAssemblyProject(
              previewDefinition,
              editorProject.source,
              editorProject.panelProfile,
            );
            await applyLoadedSculpture(
              createLoadedSculpture(previewProject),
              true,
            );
          }
          const lastLogLine = result.log?.trim().split("\n").at(-1);
          pipelineStatus.textContent =
            lastLogLine ?? "Pipeline complete; exact STL meshes are now loaded.";
          viewerError.hidden = true;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
        } finally {
          renderEditorFaces();
          updatePipelineAvailability();
        }
    };

    assemblyPackageButton.addEventListener("click", () => {
      void (async () => {
        try {
          if (verifiedGeneratedMechanics) {
            downloadAssemblyPackage();
          } else {
            await buildAssemblyPackage();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pipelineStatus.classList.add("pipeline-status--error");
          pipelineStatus.textContent = message;
          viewerError.hidden = false;
          viewerError.textContent = message;
          updatePipelineAvailability();
        }
      })();
    });
    ledCountInput.value = String(mapping.entries.length);
    ledCountDisplay.textContent = mapping.entries.length.toLocaleString();
    renderEditorFaces();
    renderOutputLayerControls();
    renderRouteEditor();
    updateMappingStatus();
    const generatorStatus = await generatorStatusPromise;
    pipelineAvailable = generatorStatus.available;
    pipelineAvailabilityMessage = generatorStatus.message;
    pipelineStatus.textContent = generatorStatus.message;
    pipelineStatus.classList.toggle(
      "pipeline-status--error",
      !generatorStatus.available,
    );
    updatePipelineAvailability();

    await restoreGeneratedMechanics(loadedSculpture);
    await loadReferencedDesignSurface();

    const animate = (now: number): void => {
      const delta = Math.min(now - previousTime, 100);
      previousTime = now;
      simulationTime += delta;
      engine.tick(Math.floor(simulationTime));

      renderer?.updateColors(engine.pixels, currentDisplayMode);
      renderer?.render();

      fpsFrames += 1;
      const fpsElapsed = now - fpsWindowStart;
      if (fpsElapsed >= 500) {
        fpsDisplay.textContent = String(
          Math.round((fpsFrames * 1000) / fpsElapsed),
        );
        frameTimeDisplay.textContent = `${Math.round(simulationTime).toLocaleString()} ms`;
        fpsWindowStart = now;
        fpsFrames = 0;
      }

      if (engine.outOfBoundsWriteCount > 0) {
        viewerError.hidden = false;
        viewerError.textContent = `Guard caught ${engine.outOfBoundsWriteCount} out-of-range pixel writes.`;
      } else {
        viewerError.hidden = true;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    engineStatus.textContent = "Engine failed to load";
    viewerError.hidden = false;
    viewerError.textContent = message;
    console.error(error);
  }
}

void start();

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  renderer?.dispose();
});
