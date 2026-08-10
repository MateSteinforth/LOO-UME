import "./styles.css";
import {
  createPanelizedSculptureMapping,
  createUniformSphereMapping,
  SCULPTURE_GEOMETRY,
  validateMapping,
} from "./LedMapping";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
} from "./HardwareMapping";
import { SphereRenderer, type DisplayMode } from "./SphereRenderer";
import { WledEngine } from "./WledEngine";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "./WiringPreview";

const DEFAULT_LED_COUNT = SCULPTURE_GEOMETRY.totalLedCount;
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
          <span id="mapping-tag" class="provisional-tag">MECHANICAL 41-PANEL PREVIEW</span>
          <span>Drag to orbit · Scroll to zoom</span>
        </div>
        <div class="viewer-overlay viewer-overlay--bottom">
          <div class="metric">
            <span class="metric-label">FPS</span>
            <strong id="fps">—</strong>
          </div>
          <div class="metric">
            <span class="metric-label">LEDs</span>
            <strong id="led-count-display">2,624</strong>
          </div>
          <div class="metric">
            <span class="metric-label">Panels</span>
            <strong id="panel-count-display">41</strong>
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
              <input id="led-count" type="number" min="64" max="200000" step="1" value="2624" />
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
            <div class="output-layer-list" aria-label="Controller output visibility">
              <label class="output-layer" style="--output-color: #36e0d0">
                <input class="output-layer-toggle" data-output-index="0" type="checkbox" checked />
                <span class="output-swatch"></span>
                <span>PIN / OUT 1</span>
                <small>11 panels</small>
              </label>
              <label class="output-layer" style="--output-color: #ff9d5c">
                <input class="output-layer-toggle" data-output-index="1" type="checkbox" checked />
                <span class="output-swatch"></span>
                <span>PIN / OUT 2</span>
                <small>10 panels</small>
              </label>
              <label class="output-layer" style="--output-color: #b58cff">
                <input class="output-layer-toggle" data-output-index="2" type="checkbox" checked />
                <span class="output-swatch"></span>
                <span>PIN / OUT 3</span>
                <small>10 panels</small>
              </label>
              <label class="output-layer" style="--output-color: #c6ed68">
                <input class="output-layer-toggle" data-output-index="3" type="checkbox" checked />
                <span class="output-swatch"></span>
                <span>PIN / OUT 4</span>
                <small>10 panels</small>
              </label>
            </div>
            <div class="connector-key">
              <span><i class="connector-dot connector-dot--din"></i>DIN</span>
              <span><i class="connector-dot connector-dot--dout"></i>DOUT</span>
              <small>Diagonal from 3D parts &middot; DIN/DOUT assignment provisional</small>
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
const displayMode = query<HTMLSelectElement>("#display-mode");
const ledCountInput = query<HTMLInputElement>("#led-count");
const applyCount = query<HTMLButtonElement>("#apply-count");
const autoRotate = query<HTMLInputElement>("#auto-rotate");
const mappingStatus = query<HTMLElement>("#mapping-status");
const mappingTag = query<HTMLElement>("#mapping-tag");
const mappingNote = query<HTMLElement>("#mapping-note");
const panelLabelsToggle = query<HTMLInputElement>("#panel-labels");
const connectorLayerToggle =
  query<HTMLInputElement>("#connector-layer");
const wiringLayerToggle = query<HTMLInputElement>("#wiring-layer");
const wiringLayerControls = query<HTMLElement>("#wiring-layer-controls");
const outputLayerToggles = Array.from(
  document.querySelectorAll<HTMLInputElement>(".output-layer-toggle"),
);

let renderer: SphereRenderer | undefined;
let animationFrame = 0;

async function start(): Promise<void> {
  try {
    const engine = await WledEngine.create(DEFAULT_LED_COUNT);
    let geometryMapping = createPanelizedSculptureMapping();
    let wiringPreview = createProvisionalWiringPreview(geometryMapping);
    let hardwareContract = createHardwareMappingContract(
      geometryMapping,
      wiringPreview,
    );
    let mapping = hardwareContract.mapping;
    renderer = new SphereRenderer(viewerElement, mapping);
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
      mappingStatus.innerHTML = allValid
        ? `<span class="validation-icon">✓</span><span>${isPanelized ? "41 panels / 2,624 LEDs / 4 routes valid" : "Fallback mapping is valid"}</span>`
        : `<span class="validation-icon">!</span><span>${validation.errors[0] ?? wiringValidation.errors[0] ?? ledmapErrors[0] ?? "Invalid mapping"}</span>`;
      panelCountDisplay.textContent = isPanelized
        ? String(mapping.panels.length)
        : "—";
      mappingTag.textContent = isPanelized
        ? "MECHANICAL 41-PANEL PREVIEW"
        : "PROVISIONAL UNIFORM FALLBACK";
      mappingNote.textContent = isPanelized
        ? `Simulator and ledmap share route ${hardwareContract.fingerprint}. Hardware export is blocked until ${hardwareContract.readiness.blockers.length} calibration requirements are resolved.`
        : "Custom LED counts use the panel-free Fibonacci fallback.";
      panelLabelsToggle.disabled = !isPanelized;
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
    connectorLayerToggle.addEventListener("change", () => {
      renderer?.setConnectorLayerVisible(connectorLayerToggle.checked);
    });
    wiringLayerToggle.addEventListener("change", () => {
      renderer?.setWiringLayerVisible(wiringLayerToggle.checked);
    });
    for (const toggle of outputLayerToggles) {
      toggle.addEventListener("change", () => {
        renderer?.setOutputVisible(
          Number(toggle.dataset.outputIndex),
          toggle.checked,
        );
      });
    }
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
      geometryMapping =
        requested === DEFAULT_LED_COUNT
          ? createPanelizedSculptureMapping()
          : createUniformSphereMapping(requested);
      wiringPreview = createProvisionalWiringPreview(geometryMapping);
      if (geometryMapping.topology === "panelized-sculpture") {
        hardwareContract = createHardwareMappingContract(
          geometryMapping,
          wiringPreview,
        );
        mapping = hardwareContract.mapping;
      } else {
        mapping = geometryMapping;
      }
      renderer?.setMapping(mapping);
      renderer?.setWiringPreview(wiringPreview);
      resetTimeline();
      ledCountDisplay.textContent = requested.toLocaleString();
      updateMappingStatus();
    });

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
