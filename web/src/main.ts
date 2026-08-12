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
  rotatePanelAroundLocalZ,
  sculptureJson,
} from "../../src/sculpture/SculptureEditor";
import {
  loadGlbDesignSurface,
  loadMechanicalShellDesignSurface,
  placementMeshFromSurface,
  type LoadedDesignSurface,
} from "./DesignSurfaceLoader";
import { SphereRenderer, type DisplayMode } from "./SphereRenderer";
import { WledEngine } from "./WledEngine";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "./WiringPreview";

const DEFAULT_SCULPTURE_JSON = "./sculptures/cuboctahedron-empty-66/sculpture.json";
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
    async (reference) => {
      const profileResponse = await fetch(
        new URL(`./catalog/panels/${reference.id}.json`, document.baseURI),
      );
      if (!profileResponse.ok) {
        throw new Error(
          `Unable to find panel profile ${reference.id} in the staged catalog.`,
        );
      }
      return profileResponse.json() as Promise<unknown>;
    },
  );
  return createLoadedSculpture(project);
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
            <span>Exact OpenSCAD closures + screw tabs</span>
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
          <input id="design-surface-file" type="file" accept="model/gltf-binary,.glb" hidden />
          <div class="editor-actions">
            <button id="load-sculpture-file" type="button">Load JSON file</button>
            <button id="save-sculpture-file" type="button">Save JSON</button>
          </div>
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
              Evenly seeds new panels across the active GLB or JSON shell. Existing panels stay in place and can be edited manually.
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
            <button id="generate-mapping" class="pipeline-button" type="button">
              Generate WLED mapping + optimized wiring
            </button>
            <button id="generate-print-parts" class="pipeline-button" type="button">
              Generate 3D print elements
            </button>
          </div>
          <div id="pipeline-status" class="pipeline-status" role="status">
            Local Vite pipeline is ready.
          </div>
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
const generatePrintPartsButton =
  query<HTMLButtonElement>("#generate-print-parts");
const pipelineStatus = query<HTMLElement>("#pipeline-status");
const pipelineAvailable = import.meta.env.DEV;
generatePrintPartsButton.disabled = !pipelineAvailable;
if (!pipelineAvailable) {
  pipelineStatus.textContent =
    "Mapping and wiring exports are available. Run npm run dev:web to generate 3D print elements.";
}
let outputLayerToggles: HTMLInputElement[] = [];

let renderer: SphereRenderer | undefined;
let animationFrame = 0;

async function start(): Promise<void> {
  try {
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
      generateMappingButton.disabled =
        mapping.topology !== "panelized-sculpture";
      generatePrintPartsButton.disabled =
        !pipelineAvailable ||
        editorDefinition.manualMechanics !== undefined;
      generatePrintPartsButton.title = editorDefinition.manualMechanics
        ? "This sculpture uses manually authored SCAD parts; generic 3D generation is intentionally disabled."
        : "";
      automaticPanelPlacementControls.hidden =
        editorDefinition.manualMechanics !== undefined;
      automaticallyPlacePanelsButton.disabled =
        editorDefinition.manualMechanics !== undefined ||
        activePlacementSurface === undefined;
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

    const updateMappingStatus = (): void => {
      const validation = validateMapping(mapping, engine.ledCount);
      const isPanelized = mapping.topology === "panelized-sculpture";
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
      mappingNote.textContent = editorDefinition.manualMechanics
        ? "Mapping and wiring use authoritative poses. Printable mechanics use the manually authored SCAD parts; generic cap generation is disabled."
        : !mechanicalShellIsCurrent()
        ? "Panel poses changed on an authoring surface. Wiring preview follows those poses; printable closures are hidden until the mechanical shell is regenerated."
        : isPanelized
          ? `Simulator and ledmap share route ${hardwareContract.fingerprint}. Hardware export is blocked until ${hardwareContract.readiness.blockers.length} calibration requirements are resolved.`
          : "Custom LED counts use the panel-free Fibonacci fallback.";
      panelLabelsToggle.disabled = !isPanelized;
      const hasPrintableClosures =
        isPanelized &&
        mechanicalShellIsCurrent() &&
        (mapping.printableClosures?.length ?? 0) > 0;
      printableLayerToggle.disabled = !hasPrintableClosures;
      shellTransparencyInput.disabled = !isPanelized;
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
    ): void => {
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
      engine.resize(mapping.entries.length);
      ledCountInput.value = String(mapping.entries.length);
      ledCountDisplay.textContent = mapping.entries.length.toLocaleString();
      renderer?.setPanelProfileThickness(
        selected.project.panelProfile.dimensions.thickness,
      );
      renderer?.setMapping(mapping);
      renderer?.setWiringPreview(wiringPreview);
      renderOutputLayerControls();
      resetTimeline();
      updateMappingStatus();
    };

    const clearDesignSurface = (message: string): void => {
      activePlacementSurface = undefined;
      automaticallyPlacePanelsButton.disabled = true;
      renderer?.setDesignSurface(null);
      surfaceStatus.textContent = message;
      selectedPanelStatus.textContent = "No design surface loaded.";
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
      selectedPanelStatus.textContent =
        `Click a panel for its local-XY/local-Z gizmo. Drag empty space to orbit; click the ${attachmentSurface === "mechanical-shell" ? "JSON shell" : "GLB"} mesh to add a panel.`;
    };

    const showMechanicalShellSurface = (message?: string): void => {
      const surface = loadMechanicalShellDesignSurface(editorDefinition);
      showDesignSurface(surface, "sculpture JSON face graph", "mechanical-shell");
      if (message) surfaceStatus.textContent = message;
    };

    const loadReferencedDesignSurface = async (): Promise<void> => {
      const definition = editorDefinition.designSurface;
      if (editorDefinition.manualMechanics) {
        clearDesignSurface(
          "This sculpture uses manually authored mechanics. Pose mapping and wiring remain available; surface editing and generic cap regeneration are disabled.",
        );
        return;
      }
      if (!definition) {
        showMechanicalShellSurface();
        return;
      }
      surfaceScaleInput.value = String(definition.scaleToMillimeters);
      if (editorProject.source.startsWith("local:")) {
        showMechanicalShellSurface(
          "Using the JSON face graph. This project references " +
            definition.source +
            "; load that companion GLB to use its higher-resolution surface.",
        );
        return;
      }
      clearDesignSurface("Loading referenced GLB " + definition.source + "…");
      const sculptureUrl = new URL(editorProject.source, document.baseURI);
      const surfaceUrl = new URL(definition.source, sculptureUrl);
      const response = await fetch(surfaceUrl);
      if (!response.ok) {
        throw new Error(
          "Unable to load design-surface GLB: HTTP " + response.status + ".",
        );
      }
      const surface = await loadGlbDesignSurface(
        await response.arrayBuffer(),
        definition.scaleToMillimeters,
      );
      if (surface.sha256.toLowerCase() !== definition.sha256.toLowerCase()) {
        surface.geometry.dispose();
        throw new Error("The referenced GLB does not match its sculpture JSON SHA-256.");
      }
      showDesignSurface(surface, definition.source);
    };

    renderer?.setSurfaceEditorCallbacks({
      onSelectionChange: (panelId) => {
        selectedPanelStatus.textContent = panelId
          ? `Selected ${panelId}. Use the center/axes to move in local XY, the blue ring to rotate around local Z, or × to delete.`
          : "Click a panel for its gizmo, or click the mesh to add a panel.";
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
          pipelineStatus.textContent =
            "Moved " + placement.panelId +
            ". Pose is saved; 3D generation will validate it against the JSON boundary and regenerate printable mechanics.";
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
          pipelineStatus.textContent =
            `Rotated ${panelId} ${Math.abs(degrees).toFixed(1)}° ${direction} as viewed from outside. 3D generation will revalidate its full PCB envelope.`;
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
          pipelineStatus.textContent =
            `Added ${panelId} on canvas triangle ${placement.attachment.triangleIndex}. 3D generation will regenerate from the JSON mechanical boundary.`;
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
          pipelineStatus.textContent =
            `Deleted ${panelId}. 3D generation will regenerate the closed JSON mechanical boundary.`;
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
        applyLoadedSculpture(selected);
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
          applyLoadedSculpture(selected);
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
          const surface = await loadGlbDesignSurface(
            await file.arrayBuffer(),
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
          showDesignSurface(surface, file.name);
          pipelineStatus.classList.remove("pipeline-status--error");
          pipelineStatus.textContent =
            "Attached " + file.name +
            " to the sculpture JSON. Save both files together to preserve the reference.";
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
          placementMeshFromSurface(
            surface,
            attachmentSurface === "design-surface",
          ),
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
          }. Mapping and provisional wiring are refreshed; adjust poses manually before separate 3D generation.`;
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
          `${baseName}.optimized-wiring.json`,
          {
            schemaVersion: "1.0.0",
            sculptureId: editorDefinition.id,
            status: wiringPreview.status,
            optimization:
              "configured sectors followed by deterministic nearest-neighbor routing",
            fingerprint: hardwareContract.fingerprint,
            outputs: hardwareContract.outputs,
            wiring: wiringPreview,
            readiness: hardwareContract.readiness,
          },
        );
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent =
          `Exported WLED ledmap and optimized wiring for ${mapping.entries.length.toLocaleString()} LEDs; fingerprint ${hardwareContract.fingerprint}.`;
        viewerError.hidden = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pipelineStatus.classList.add("pipeline-status--error");
        pipelineStatus.textContent = message;
        viewerError.hidden = false;
        viewerError.textContent = message;
      }
    });

    generatePrintPartsButton.addEventListener("click", () => {
      void (async () => {
        generatePrintPartsButton.disabled = true;
        addPanelButton.disabled = true;
        pipelineStatus.classList.remove("pipeline-status--error");
        pipelineStatus.textContent =
          "Regenerating mechanical topology, then generating OpenSCAD, STLs, and printable previews…";
        try {
          const response = await fetch("./api/editor-pipeline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: sculptureJson(editorDefinition),
          });
          const result = (await response.json()) as {
            ok?: boolean;
            assetSculptureId?: string;
            log?: string;
            definition?: unknown;
            error?: string;
          };
          if (!response.ok || !result.ok || !result.assetSculptureId || !result.definition) {
            throw new Error(
              result.error ?? `Pipeline failed with HTTP ${response.status}.`,
            );
          }
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
          applyLoadedSculpture(
            createLoadedSculpture(previewProject),
            true,
          );
          const lastLogLine = result.log?.trim().split("\n").at(-1);
          pipelineStatus.textContent =
            lastLogLine ?? "Pipeline complete; exact STL meshes are now loaded.";
          viewerError.hidden = true;
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
      renderOutputLayerControls();
      resetTimeline();
      ledCountDisplay.textContent = requested.toLocaleString();
      updateMappingStatus();
    });

    ledCountInput.value = String(mapping.entries.length);
    ledCountDisplay.textContent = mapping.entries.length.toLocaleString();
    renderEditorFaces();
    renderOutputLayerControls();
    updateMappingStatus();
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
