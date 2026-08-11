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
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly";
import { SphereRenderer, type DisplayMode } from "./SphereRenderer";
import { WledEngine } from "./WledEngine";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "./WiringPreview";

const DEFAULT_SCULPTURE_JSON = "./sculptures/cuboctahedron/sculpture.json";
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

async function loadSculptureContract(
  source: string,
): Promise<HardwareMappingContract> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      "Unable to load sculpture JSON " + source + ": HTTP " + response.status + ".",
    );
  }
  const project = createPanelAssemblyProject(await response.json(), source);
  const geometry = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    geometry,
    project.sculpture,
    project.panelProfile,
  );
  return createHardwareMappingContract(
    geometry,
    wiring,
    project.panelProfile,
  );
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

    let selectedHardwareContract = await loadSculptureContract(
      initialSculptureSource,
    );
    let hardwareContract = selectedHardwareContract;
    const engine = await WledEngine.create(
      hardwareContract.mapping.entries.length,
    );
    let wiringPreview = hardwareContract.wiring;
    let mapping = hardwareContract.mapping;
    renderer = new SphereRenderer(viewerElement, mapping);
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

    const resetTimeline = (): void => {
      simulationTime = 0;
      engine.reset();
      engine.tick(0);
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
      mappingNote.textContent = isPanelized
        ? `Simulator and ledmap share route ${hardwareContract.fingerprint}. Hardware export is blocked until ${hardwareContract.readiness.blockers.length} calibration requirements are resolved.`
        : "Custom LED counts use the panel-free Fibonacci fallback.";
      panelLabelsToggle.disabled = !isPanelized;
      const hasPrintableClosures =
        isPanelized && (mapping.printableClosures?.length ?? 0) > 0;
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
    };

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
        selectedHardwareContract = selected;
        hardwareContract = selected;
        mapping = selected.mapping;
        wiringPreview = selected.wiring;
        engine.resize(mapping.entries.length);
        ledCountInput.value = String(mapping.entries.length);
        ledCountDisplay.textContent = mapping.entries.length.toLocaleString();
        renderer?.setMapping(mapping);
        renderer?.setWiringPreview(wiringPreview);
        renderOutputLayerControls();
        resetTimeline();
        updateMappingStatus();
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
    renderOutputLayerControls();
    updateMappingStatus();

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
