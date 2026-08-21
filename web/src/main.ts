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
  moveRoutePanelWithinOutput,
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
import { createWiringAssemblyManualModel } from "./WiringAssemblyManual.ts";
import { createManualHandshakeToken } from "./ManualHandshake.ts";
import { compilePanelBoundaryBundle } from "../../src/cad/CompilePanelBoundaryBundle.ts";

const DEFAULT_SCULPTURE_JSON = "./sculptures/pose-only-rhombicosidodecahedron/sculpture.json";
const SCULPTURE_REGISTRY_URL = "./sculptures/manifest.json";
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
  const registry = (await response.json()) as Partial<SculptureRegistry>;
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
  const sculptureInput: unknown = await response.json();
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
      return profileResponse.json() as Promise<unknown>;
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
  return profileResponse.json() as Promise<unknown>;
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
      <div class="engine-badge">
        <span class="status-dot" id="engine-dot"></span>
        <span id="engine-status">Loading WebAssembly…</span>
      </div>
    </header>

    <main class="workspace">
      <section class="viewer-panel" aria-label="3D LED sphere">
        <div id="viewer" class="viewer"></div>
        <div class="viewer-overlay viewer-overlay--top">
          <span id="mapping-tag" class="provisional-tag">LOADING SCULPTURE JSON</span>
          <span>Drag to orbit · Scroll to zoom</span>
        </div>
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
        <section class="control-section transport">
          <button id="play-toggle" class="play-button" type="button">
            <span id="play-icon">Ⅱ</span>
            <span id="play-label">Pause engine</span>
          </button>
          <button id="restart" class="icon-button" type="button" title="Restart deterministic timeline">↺</button>
        </section>

        <section class="control-section">
          <div class="section-heading">
            <span>WLED engine</span>
            <small>actual C++ / WASM</small>
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
          <div class="color-row">
            <label class="color-field">
              <span>Primary</span>
              <input id="primary-color" type="color" value="#ff7a18" />
            </label>
            <label class="color-field">
              <span>Secondary</span>
              <input id="secondary-color" type="color" value="#050816" />
            </label>
          </div>
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
            <span>Custom sculpture JSON</span>
            <div class="input-action">
              <input id="sculpture-json" type="text" />
              <button id="load-sculpture" type="button">Load</button>
            </div>
          </label>
          <label class="field">
            <span>Display</span>
            <select id="display-mode">
              <option value="wled">WLED framebuffer</option>
              <option value="physical-index">Physical index bands</option>
              <option value="logical-index">Logical index bands</option>
            </select>
          </label>
          <label class="field">
            <span>Virtual LED count</span>
            <div class="input-action">
              <input id="led-count" type="number" min="64" max="200000" step="1" value="64" />
              <button id="apply-count" type="button">Apply</button>
            </div>
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
          <label class="field slider-field">
            <span>Shell transparency <output id="shell-transparency-value">35%</output></span>
            <input id="shell-transparency" type="range" min="0" max="90" value="35" />
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
          <p id="mapping-note" class="mapping-note">Transforms, pixel order, and wiring are unmeasured.</p>
        </section>

        <section class="control-section editor-section">
          <div class="section-heading">
            <span>Sculpture editor</span>
            <small>pose-first JSON</small>
          </div>
          <input id="sculpture-file" type="file" accept="application/json,.json" hidden />
          <input id="project-folder" type="file" webkitdirectory multiple hidden />
          <input id="project-zip" type="file" accept="application/zip,.zip" hidden />
          <input id="design-surface-file" type="file" accept="model/gltf-binary,.glb" hidden />
          <div class="editor-actions">
            <button id="load-sculpture-file" type="button">Load JSON file</button>
            <button id="save-sculpture-file" type="button">Save JSON</button>
            <button id="load-project-folder" type="button">Open project folder</button>
            <button id="load-project-zip" type="button">Open project ZIP</button>
            <button id="export-project-folder" type="button">Export project folder</button>
            <button id="export-project-zip" type="button">Export project ZIP</button>
          </div>
          <p class="mapping-note">Folder and ZIP projects keep the JSON, GLB, boundary, and exact STL parts together.</p>
          <section id="route-editor-section" class="route-editor-section" hidden>
            <div class="section-heading editor-subheading">
              <span>Wiring route editor</span>
              <small>controller to DIN to DOUT</small>
            </div>
            <p id="route-editor-note" class="mapping-note"></p>
            <div id="route-editor" class="route-editor" aria-label="Panel wiring route editor"></div>
            <button id="copy-draft-route" class="editor-button" type="button">Copy draft suggestion to edit</button>
            <button id="confirm-wiring-route" class="editor-button" type="button">Confirm wiring route revision</button>
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
          <p id="selected-panel-status" class="mapping-note">
            No design surface loaded.
          </p>
          <div id="automatic-panel-placement-controls">
            <label class="field">
              <span>Target panel count</span>
              <input id="automatic-panel-count" type="number" min="1" step="1" value="6" />
            </label>
            <button id="automatically-place-panels" class="editor-button" type="button" disabled>
              Automatically place panels
            </button>
            <p class="mapping-note">
              The GLB is only a placement aid. Printable caps come from the holes between panel outlines, not from the mesh.
            </p>
          </div>
          <label class="field">
            <span>Available closure face</span>
            <select id="add-panel-face"></select>
          </label>
          <button id="add-panel" class="editor-button" type="button">
            Add panel to face
          </button>
          <p class="mapping-note">
            Add panel insets the PCB into a closure face, fills the surrounding ring,
            and keeps every panel edge connected to printable closure parts.
          </p>
          <div class="pipeline-actions">
            <button id="open-wiring-manual" class="pipeline-button" type="button">
              Export wiring assembly manual
            </button>
            <button id="generate-mapping" class="pipeline-button" type="button">
              Generate WLED mapping + wiring review
            </button>
            <button id="generate-print-parts" class="pipeline-button" type="button">
              Generate boundary / 3D parts
            </button>
            <button id="download-print-parts" class="pipeline-button" type="button" disabled>
              Download verified STL files
            </button>
          </div>
          <div id="pipeline-status" class="pipeline-status" role="status">
            Local Vite pipeline is ready.
          </div>
          <p class="mapping-note">
            Generate puts flat caps on the holes between panel outlines. It does not use the GLB or a JSON shell as geometry. Neighbouring outline corners must meet. A failed run keeps the last successful STL set.
          </p>
        </section>

        <section class="architecture-card">
          <span>FRAME PATH</span>
          <p>WLED FX.cpp → WASM memory → LUT → Three.js</p>
          <small>No JavaScript effect reimplementation.</small>
        </section>
      </aside>
    </main>

    <footer>
      <span>Upstream WLED <code>d9b9a84</code></span>
      <span>Photosensitive users: avoid strobe effects and high speed.</span>
    </footer>
  </div>
`;

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const viewerElement = query<HTMLDivElement>("#viewer");
const engineStatus = query<HTMLSpanElement>("#engine-status");
const engineDot = query<HTMLSpanElement>("#engine-dot");
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
const primaryColor = query<HTMLInputElement>("#primary-color");
const secondaryColor = query<HTMLInputElement>("#secondary-color");
const playButton = query<HTMLButtonElement>("#play-toggle");
const playIcon = query<HTMLElement>("#play-icon");
const playLabel = query<HTMLElement>("#play-label");
const restartButton = query<HTMLButtonElement>("#restart");
const sculptureSelect = query<HTMLSelectElement>("#sculpture-select");
const sculptureJsonInput = query<HTMLInputElement>("#sculpture-json");
const loadSculptureButton = query<HTMLButtonElement>("#load-sculpture");
const displayMode = query<HTMLSelectElement>("#display-mode");
const ledCountInput = query<HTMLInputElement>("#led-count");
const applyCount = query<HTMLButtonElement>("#apply-count");
const autoRotate = query<HTMLInputElement>("#auto-rotate");
const mappingStatus = query<HTMLElement>("#mapping-status");
const mappingTag = query<HTMLElement>("#mapping-tag");
const mappingNote = query<HTMLElement>("#mapping-note");
const panelLabelsToggle = query<HTMLInputElement>("#panel-labels");
const printableLayerToggle = query<HTMLInputElement>("#printable-layer");
const shellTransparencyInput =
  query<HTMLInputElement>("#shell-transparency");
const shellTransparencyValue =
  query<HTMLOutputElement>("#shell-transparency-value");
const connectorLayerToggle =
  query<HTMLInputElement>("#connector-layer");
const wiringLayerToggle = query<HTMLInputElement>("#wiring-layer");
const wiringLayerControls = query<HTMLElement>("#wiring-layer-controls");
const outputLayerList = query<HTMLElement>("#output-layer-list");
const sculptureFileInput = query<HTMLInputElement>("#sculpture-file");
const loadSculptureFileButton =
  query<HTMLButtonElement>("#load-sculpture-file");
const saveSculptureFileButton =
  query<HTMLButtonElement>("#save-sculpture-file");
const projectFolderInput = query<HTMLInputElement>("#project-folder");
const projectZipInput = query<HTMLInputElement>("#project-zip");
const loadProjectFolderButton =
  query<HTMLButtonElement>("#load-project-folder");
const loadProjectZipButton =
  query<HTMLButtonElement>("#load-project-zip");
const exportProjectFolderButton =
  query<HTMLButtonElement>("#export-project-folder");
const exportProjectZipButton =
  query<HTMLButtonElement>("#export-project-zip");
const routeEditorSection = query<HTMLElement>("#route-editor-section");
const routeEditorNote = query<HTMLElement>("#route-editor-note");
const routeEditor = query<HTMLElement>("#route-editor");
const copyDraftRouteButton = query<HTMLButtonElement>("#copy-draft-route");
const confirmWiringRouteButton = query<HTMLButtonElement>("#confirm-wiring-route");
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
const generateMappingButton =
  query<HTMLButtonElement>("#generate-mapping");
const openWiringManualButton =
  query<HTMLButtonElement>("#open-wiring-manual");
const generatePrintPartsButton =
  query<HTMLButtonElement>("#generate-print-parts");
const downloadPrintPartsButton =
  query<HTMLButtonElement>("#download-print-parts");
const pipelineStatus = query<HTMLElement>("#pipeline-status");
let pipelineAvailable = false;
let pipelineAvailabilityMessage =
  "Checking local Manifold availability. Mapping and wiring remain available.";
generatePrintPartsButton.disabled = true;
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
      Number(shellTransparencyInput.value) / 100,
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
    engine.setPrimaryColor(primaryColor.value);
    engine.setSecondaryColor(secondaryColor.value);

    engineStatus.textContent = `${engine.effects.length} WLED effects ready`;
    engineDot.classList.add("status-dot--ready");

    let playing = true;
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
        mapping.topology !== "panelized-sculpture" ||
        !hardwareContract.readiness.mappingReady;
      openWiringManualButton.title = !hardwareContract.readiness.mappingReady
        ? "The printable manual requires a current mapping-ready route."
        : "Open the current in-memory project as an A4 landscape wiring manual.";
      generatePrintPartsButton.disabled =
        !capabilities.canGenerateGenericMechanics;
      generatePrintPartsButton.title = editorDefinition.manualMechanics
        ? "This sculpture uses manually authored SCAD parts; generic 3D generation is intentionally disabled."
        : "Put flat caps on the holes between panel outlines in the browser. Neighbouring corners must meet. The GLB is placement-only.";
      automaticPanelPlacementControls.hidden =
        editorDefinition.manualMechanics !== undefined;
      automaticallyPlacePanelsButton.disabled =
        !capabilities.canAutomaticallySeed;
      automaticallyPlacePanelsButton.title = editorDefinition.manualMechanics
        ? "Automatic placement is disabled for manually authored mechanics."
        : activePlacementSurface
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
        copyDraftRouteButton.hidden = true;
        confirmWiringRouteButton.disabled = true;
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
          ? "The shown route is a draft suggestion. Copy it before you edit or confirm it."
          : wiringPreview.status === "measured"
            ? "This is the saved measured route. A new confirmation saves an authored revision and removes the old measurement approval."
            : editorDefinition.wiring.routeRevision === undefined
              ? "This saved route has no confirmed revision. Review it, then confirm revision 1."
              : wiringPreview.status === "requires-review"
                ? "This saved route requires review. Confirm it only after its order matches the sculpture."
                : "This is the saved authored route. Edit it, then confirm a new route revision.";
      routeEditorNote.textContent = sourceLabel;
      copyDraftRouteButton.hidden = !isDraftSuggestion;
      copyDraftRouteButton.disabled = !isDraftSuggestion;
      confirmWiringRouteButton.disabled = !validation.valid;
      routeEditorStatus.classList.toggle("route-editor-status--error", !validation.valid);
      routeEditorStatus.textContent = validation.valid
        ? `Route is complete. Confirm to save revision ${(editorDefinition.wiring.routeRevision ?? 0) + 1}.`
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
          const selectPanel = document.createElement("button");
          selectPanel.type = "button";
          selectPanel.textContent = "Select";
          selectPanel.setAttribute("aria-label", `Select panel ${panelId}`);
          selectPanel.addEventListener("click", () => {
            renderer?.selectEditorPanel(panelId);
          });
          const up = document.createElement("button");
          up.type = "button";
          up.textContent = "Up";
          up.setAttribute(
            "aria-label",
            `Move ${panelId} up in ${output.label}`,
          );
          up.disabled = isDraftSuggestion || chainPosition === 0;
          up.addEventListener("click", () => {
            routeEditorModel = moveRoutePanelWithinOutput(
              model, output.outputIndex, panelId, -1,
            );
            renderRouteEditor();
          });
          const down = document.createElement("button");
          down.type = "button";
          down.textContent = "Down";
          down.setAttribute(
            "aria-label",
            `Move ${panelId} down in ${output.label}`,
          );
          down.disabled = isDraftSuggestion || chainPosition === output.panelIds.length - 1;
          down.addEventListener("click", () => {
            routeEditorModel = moveRoutePanelWithinOutput(
              model, output.outputIndex, panelId, 1,
            );
            renderRouteEditor();
          });
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
          assignment.append(outputSelect);
          item.append(detail, selectPanel, up, down, assignment);
          list.append(item);
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
      mappingTag.textContent = isPanelized
        ? mapping.panels.length +
          "-PANEL " +
          mapping.id.toUpperCase() +
          " PREVIEW"
        : "PROVISIONAL UNIFORM FALLBACK";
      const mechanicalNote = editorDefinition.manualMechanics
        ? editorDefinition.manualMechanics.compatibilityStatus === "requires-review"
          ? "Mapping and wiring use the edited authoritative poses. Manually authored printable mechanics require review and cannot be presented as verified."
          : "Mapping and wiring use authoritative poses. Printable mechanics use the manually authored SCAD parts; generic cap generation is disabled."
        : editorDefinition.mechanicalShell && !mechanicalShellIsCurrent()
          ? "Panel poses changed on an authoring surface. Wiring preview follows those poses; printable closures are hidden until the mechanical shell is regenerated."
        : generatedState === "stale"
          ? "Mapping and wiring follow the edited poses. The last generated STL set is stale and hidden until regeneration succeeds."
        : verifiedGeneratedMechanics
          ? `Mapping and wiring use authoritative poses. Three.js and downloads use the same SHA-256-verified STL bytes (${verifiedGeneratedMechanics.parts.length} parts).`
        : editorDefinition.boundaryTopology
          ? "Mapping and wiring use authoritative poses. Generate 3D Parts validates the accepted gap cycles before creating printable material."
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
      shellTransparencyInput.disabled = !isPanelized;
      connectorLayerToggle.disabled = !isPanelized;
      wiringLayerToggle.disabled = !isPanelized;
      downloadPrintPartsButton.disabled =
        verifiedGeneratedMechanics === undefined;
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
      downloadPrintPartsButton.disabled = true;
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
          ? options
          : [new Option("No closure faces available", "")]),
      );
      addPanelButton.disabled = options.length === 0;
    };

    const applyLoadedSculpture = (
      selected: LoadedSculpture,
      preserveEditorDefinition = false,
    ): Promise<void> => {
      loadedSculpture = selected;
      selectedHardwareContract = selected.contract;
      hardwareContract = selected.contract;
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
      selectedPanelStatus.textContent = editorDefinition.manualMechanics
        ? "Click a panel to move it across the referenced GLB, rotate around local Z, or delete it. New manual panels require explicit face metadata and are not added by canvas clicks."
        : "Click a panel for its local-XY/local-Z gizmo. Drag empty space to orbit; click the " + attachmentSurface + " mesh to add a panel.";
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
      if (!definition && editorDefinition.manualMechanics) {
        clearDesignSurface(
          "No authoring surface is referenced. Existing manual panels remain editable in their saved planes; generic cap generation is disabled.",
        );
        return;
      }
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
        if (editorDefinition.manualMechanics) {
          clearDesignSurface(
            "This local project references " + definition.source +
              "; load that companion GLB to use it as a visual authoring canvas. Existing panels remain editable in their saved planes.",
          );
        } else if (editorDefinition.mechanicalShell) {
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
          selectedPanelStatus.textContent = capabilities.canCreateOnActiveSurface
            ? "Click a panel for its gizmo, or click the active surface to add a panel."
            : "Click a panel to edit its authoritative JSON pose or delete it.";
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
          pipelineStatus.textContent = edited.manualMechanics
            ? "Moved " + placement.panelId + ". Mapping and wiring refreshed; manual printable mechanics now require review."
            : edited.mechanicalShell
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
          pipelineStatus.textContent = edited.manualMechanics
            ? "Moved " + panelId + " in its saved panel plane. Mapping and wiring refreshed; manual printable mechanics now require review."
            : edited.mechanicalShell
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
          pipelineStatus.textContent = edited.manualMechanics
            ? "Rotated " + panelId + " " + Math.abs(degrees).toFixed(1) + "° " + direction + ". Mapping and wiring refreshed; manual printable mechanics now require review."
            : edited.mechanicalShell
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
          pipelineStatus.textContent = edited.manualMechanics
            ? "Deleted " + panelId + ". Mapping and wiring refreshed; manual printable mechanics now require review."
            : edited.mechanicalShell
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
    primaryColor.addEventListener("input", () =>
      engine.setPrimaryColor(primaryColor.value),
    );
    secondaryColor.addEventListener("input", () =>
      engine.setSecondaryColor(secondaryColor.value),
    );
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
    shellTransparencyInput.addEventListener("input", () => {
      shellTransparencyValue.value = shellTransparencyInput.value + "%";
      renderer?.setShellTransparency(
        Number(shellTransparencyInput.value) / 100,
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
    copyDraftRouteButton.addEventListener("click", () => {
      if (!routeEditorModel) return;
      routeEditorModel = copyDraftSuggestionToRouteEditor(routeEditorModel);
      renderRouteEditor();
    });
    confirmWiringRouteButton.addEventListener("click", () => {
      void (async () => {
        try {
          if (!routeEditorModel) {
            throw new Error("A panelized wiring route is unavailable.");
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
            `Confirmed wiring route revision ${edited.wiring.routeRevision}. Save the JSON to keep this authored route.`;
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
    loadSculptureFileButton.addEventListener("click", () => {
      sculptureFileInput.click();
    });
    sculptureFileInput.addEventListener("change", () => {
      const file = sculptureFileInput.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const selected = await loadLocalSculpture(file);
          replacePortableBundle();
          await applyLoadedSculpture(selected);
          await loadReferencedDesignSurface();
          sculptureSelect.value = "";
          sculptureJsonInput.value = file.name;
          pipelineStatus.textContent = `Loaded ${file.name}.`;
          viewerError.hidden = true;
        } catch (error) {
          viewerError.hidden = false;
          viewerError.textContent =
            error instanceof Error ? error.message : String(error);
        } finally {
          sculptureFileInput.value = "";
        }
      })();
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

    loadProjectFolderButton.addEventListener("click", () => {
      projectFolderInput.click();
    });
    projectFolderInput.addEventListener("change", () => {
      const files = [...(projectFolderInput.files ?? [])];
      if (files.length === 0) return;
      void (async () => {
        loadProjectFolderButton.disabled = true;
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
          loadProjectFolderButton.disabled = false;
        }
      })();
    });

    loadProjectZipButton.addEventListener("click", () => {
      projectZipInput.click();
    });
    projectZipInput.addEventListener("change", () => {
      const file = projectZipInput.files?.[0];
      if (!file) return;
      void (async () => {
        loadProjectZipButton.disabled = true;
        try {
          const bundle = await openPortableProjectZip(
            new Uint8Array(await file.arrayBuffer()),
            file.name,
            loadStagedPanelProfile,
          );
          await applyPortableBundle(bundle, file.name);
        } catch (error) {
          reportPortableError(error);
        } finally {
          projectZipInput.value = "";
          loadProjectZipButton.disabled = false;
        }
      })();
    });

    exportProjectZipButton.addEventListener("click", () => {
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
          `Added ${edited.panels.at(-1)!.id} to ${faceId}. Save the JSON or generate the 3D print elements.`;
        viewerError.hidden = true;
      } catch (error) {
        viewerError.hidden = false;
        viewerError.textContent =
          error instanceof Error ? error.message : String(error);
      }
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

    openWiringManualButton.addEventListener("click", () => {
      const model = createWiringAssemblyManualModel(
        editorDefinition,
        hardwareContract,
        editorProject.panelProfile,
        editorProject.source,
      );
      const token = createManualHandshakeToken();
      const manualUrl = new URL("./wiring-manual.html", window.location.href);
      manualUrl.searchParams.set("fromEditor", token);
      let manualWindow: Window | null = null;
      const receiveReady = (event: MessageEvent<unknown>): void => {
        if (
          event.origin !== window.location.origin ||
          event.source !== manualWindow ||
          typeof event.data !== "object" ||
          event.data === null ||
          !("type" in event.data) ||
          event.data.type !== "wiring-manual-ready" ||
          !("token" in event.data) ||
          event.data.token !== token
        ) return;
        window.removeEventListener("message", receiveReady);
        window.clearTimeout(handshakeTimeout);
        manualWindow?.postMessage(
          { type: "wiring-manual-model", token, model },
          window.location.origin,
        );
      };
      window.addEventListener("message", receiveReady);
      const handshakeTimeout = window.setTimeout(() => {
        window.removeEventListener("message", receiveReady);
      }, 15_000);
      manualWindow = window.open(manualUrl.href, "_blank");
      if (!manualWindow) {
        window.removeEventListener("message", receiveReady);
        window.clearTimeout(handshakeTimeout);
        throw new Error("The browser blocked the wiring manual window.");
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
          {
            schemaVersion: "1.0.0",
            sculptureId: editorDefinition.id,
            status: wiringPreview.status,
            routeSource: wiringPreview.routeSource,
            savedOutputPanelIds: wiringPreview.savedOutputPanelIds,
            fingerprint: hardwareContract.fingerprint,
            outputs: hardwareContract.outputs,
            wiring: wiringPreview,
            readiness: hardwareContract.readiness,
          },
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

    downloadPrintPartsButton.addEventListener("click", () => {
      if (!verifiedGeneratedMechanics) return;
      const assets = [
        verifiedGeneratedMechanics.boundary,
        ...verifiedGeneratedMechanics.parts,
      ];
      for (const asset of assets) {
        const blob = new Blob([Uint8Array.from(asset.bytes)], {
          type: "model/stl",
        });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = asset.source.split("/").at(-1) ?? `${asset.id}.stl`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      }
      pipelineStatus.classList.remove("pipeline-status--error");
      pipelineStatus.textContent =
        `Downloaded ${assets.length} SHA-256-verified STL files from the exact bytes displayed in Three.js.`;
      viewerError.hidden = true;
    });

    generatePrintPartsButton.addEventListener("click", () => {
      void (async () => {
        generatePrintPartsButton.disabled = true;
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
              `Generated and SHA-256 verified ${partCount} exact printable STL files in the browser.`;
            viewerError.hidden = true;
          } catch (inProcessError) {
            const inProcessMessage = inProcessError instanceof Error
              ? inProcessError.message
              : String(inProcessError);
            if (!/manifold|wasm|WebAssembly/i.test(inProcessMessage)) {
              throw inProcessError;
            }
            const response = await fetch("./api/editor-pipeline", {
            method: "POST",
            body: createEditorPipelineFormData(
              editorDefinition,
              availableProjectAssets,
            ),
          });
          const result = (await response.json()) as {
            ok?: boolean;
            assetSculptureId?: string;
            log?: string;
            definition?: unknown;
            projectSource?: string;
            error?: string;
          };
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
      })();
    });
    restartButton.addEventListener("click", resetTimeline);

    playButton.addEventListener("click", () => {
      playing = !playing;
      playIcon.textContent = playing ? "Ⅱ" : "▶";
      playLabel.textContent = playing ? "Pause engine" : "Resume engine";
      playButton.classList.toggle("play-button--paused", !playing);
    });

    applyCount.addEventListener("click", () => {
      const requested = Number(ledCountInput.value);
      if (
        !Number.isInteger(requested) ||
        requested < 64 ||
        requested > 200000
      ) {
        ledCountInput.setCustomValidity(
          "Choose an integer from 64 to 200,000.",
        );
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
      if (playing) {
        simulationTime += delta;
        engine.tick(Math.floor(simulationTime));
      }

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
    engineDot.classList.add("status-dot--error");
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
