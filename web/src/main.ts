import "./styles.css";
import {
  createUniformSphereMapping,
  validateMapping,
} from "./LedMapping";
import {
  physicalAddressContractKey,
  validateLedmapEquivalence,
} from "./HardwareMapping";
import {
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
} from "../../src/sculpture/PanelAssembly";
import {
  automaticWiringOrientationPolicy,
  optimizeAutomaticWiring,
} from "../../src/sculpture/AutomaticWiringOptimizer.ts";
import {
  addPanelOnDesignSurface,
  addPanelToClosureFace,
  automaticallySeedPanelsOnSurface,
  deletePanel,
  movePanelOnDesignSurface,
  movePanelInLocalPlane,
  rotatePanelAroundLocalZ,
  setControllerWorldPose,
  setPanelWorldPose,
  setWiringPanelRotationConstraint,
  sculptureJson,
  useSuggestedControllerPose,
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
  createWiringControllerLayout,
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "./WiringPreview";
import {
  createAssemblyTutorialModel,
  nextAssemblyTutorialChain,
  nextAssemblyTutorialPanel,
  nextAssemblyTutorialWire,
  previousAssemblyTutorialChain,
  previousAssemblyTutorialPanel,
  previousAssemblyTutorialWire,
  type AssemblyTutorialChain,
  type AssemblyTutorialModel,
} from "./AssemblyTutorial.ts";
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
  openPortableProjectFiles,
  openPortableProjectZip,
  portableProjectFolderName,
  writePortableProjectFolder,
  type PortableDirectoryHandle,
  type PortableProjectBundle,
  type PortableProjectFile,
} from "./PortableProject.ts";
import {
  createProjectPackageZip,
  readProjectPackageSummary,
} from "./ProjectPackage.ts";
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
import {
  createAssemblyPackageZip,
  createWiringReview,
} from "./AssemblyPackage.ts";
import { createMadMapperPackageZip } from "./MadMapperPackage.ts";
import { createFabricationPackageZip } from "./FabricationPackage.ts";
import { createManufacturingManualPdf } from "./ManufacturingManualPdf.ts";
import {
  ArtNetPreviewClient,
  physicalRgbToLogicalPixels,
} from "./ArtNetPreview.ts";
import wiringManualStyles from "./wiring-manual.css?raw";
import { runStructuralPipeline } from "../../src/structure/StructuralPipeline.ts";
import {
  assertRectangularPanelTools,
  supportsRectangularPanelTools,
} from "../../src/sculpture/PanelCarrier.ts";
import {
  getGeneratedStructuralState,
  normalizeStructuralDesign,
  STRUCTURAL_CONNECTOR_DEFAULTS,
  STRUCTURAL_PREVIEW_DEFAULTS,
  type StructuralConnectorSurfaceStyle,
  type StructuralConnectorizationDefinition,
} from "../../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss } from "../../src/structure/CandidateTruss.ts";
import {
  loadVerifiedGeneratedStructure,
  type VerifiedGeneratedStructure,
} from "./GeneratedStructuralAssets.ts";
import {
  automaticEsp32ReconnectAvailable,
  canEnableReconnectedSimulator,
  connectExistingSimulatorDevice,
  createSimulatorSetupConfig,
  isApprovedEsp32OutputGpio,
  isCurrentSimulatorSetup,
  createEsp32SetupController,
  mappedPanelFramebuffer,
  persistStandaloneAnimation,
  rememberAutomaticEsp32Reconnect,
  retainAutomaticReconnectEligibility,
  sendSimulatorFramebuffer,
  settleSimulatorDeviceWork,
  synchronizeDeviceLedmap,
  type Esp32SetupPayload,
} from "./Esp32Setup.ts";
import {
  applyPhysicalRouteReview,
  assignPhysicalRouteReviewPanel,
  confirmPhysicalRouteReviewSlot,
  createPhysicalPanelReviewFrame,
  createPhysicalRouteReviewSession,
  nextPhysicalRouteReviewSlot,
  physicalRouteReviewChanges,
  rotatePhysicalRouteReviewPanel,
  type PhysicalRouteReviewSession,
} from "./PhysicalRouteReview.ts";
import smokeConfig from "../../firmware/one-panel-smoke-cfg.json" with { type: "json" };
import {
  createLoadedSculpture,
  DEFAULT_SCULPTURE_JSON,
  loadLocalSculpture,
  loadProjectLibraryRegistry,
  loadSculptureContract,
  loadSculptureRegistry,
  loadStagedPanelProfile,
  type LoadedSculpture,
  type ProjectLibraryEntry,
} from "./ProjectLoader.ts";
import {
  deleteProjectLibraryPackage,
  renameProjectLibraryPackage,
  replaceProjectLibraryPackage,
  saveLocalProjectPackage,
} from "./ProjectLibraryClient.ts";

const DEFAULT_PRIMARY_COLOR = "#ff7a18";
const DEFAULT_SECONDARY_COLOR = "#050816";
const DEFAULT_SHELL_TRANSPARENCY = 0.35;
const initialSculptureSource =
  new URLSearchParams(window.location.search).get("sculptureJson") ??
  DEFAULT_SCULPTURE_JSON;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("Missing #app");
const appRoot = app;

app.innerHTML = `
  <div class="app-shell">
    <main class="workspace">
      <section class="viewer-panel" aria-label="3D LED sphere">
        <div id="viewer" class="viewer"></div>
      </section>

      <aside class="control-panel">
        <section id="application-update-notice" class="application-update-notice" hidden aria-live="polite">
          <div>
            <strong>Update available</strong>
            <small id="application-update-message">A new LOO/UME version is ready.</small>
          </div>
          <button id="apply-application-update" class="editor-button" type="button">Update</button>
        </section>
        <section class="control-section project-toolbar">
          <div class="section-heading">
            <span>Project</span>
            <small>library and save</small>
          </div>
          <input id="project-file" type="file" accept="application/json,application/zip,.json,.zip" hidden />
          <input id="project-folder" type="file" webkitdirectory multiple hidden />
          <input id="design-surface-file" type="file" accept="model/gltf-binary,.glb" hidden />
          <div class="project-toolbar__library-actions">
            <button id="open-project-library" class="pipeline-button project-library-open" type="button">Project Library</button>
            <button id="save-library-project" class="editor-button" type="button">Save</button>
          </div>
          <output id="current-project-name" class="current-project-name">Loading project…</output>
          <select id="sculpture-select" hidden aria-hidden="true">
            <option value="">Loading sculpture registry…</option>
          </select>
        </section>

        <section class="control-section view-section">
          <div class="section-heading">
            <span>View</span>
            <small>always available</small>
          </div>
          <div class="animation-controls">
            <div class="animation-select-row">
              <label class="field"><span>Effect</span><select id="effect"></select></label>
              <div class="animation-select-stepper" aria-label="Cycle effects">
                <button id="previous-effect" type="button" aria-label="Previous effect">−</button>
                <button id="next-effect" type="button" aria-label="Next effect">+</button>
              </div>
            </div>
            <div class="animation-select-row">
              <label class="field"><span>Palette</span><select id="palette"></select></label>
              <div class="animation-select-stepper" aria-label="Cycle palettes">
                <button id="previous-palette" type="button" aria-label="Previous palette">−</button>
                <button id="next-palette" type="button" aria-label="Next palette">+</button>
              </div>
            </div>
            <label class="field slider-field">
              <span>Speed <output id="speed-value">128</output></span>
              <input id="speed" type="range" min="0" max="255" value="128" />
            </label>
            <label class="field slider-field">
              <span>Intensity <output id="intensity-value">128</output></span>
              <input id="intensity" type="range" min="0" max="255" value="128" />
            </label>
          </div>
          <div id="wiring-layer-controls" class="layer-controls wiring-assembly">
            <div class="wiring-assembly__layers">
            <label class="toggle-field">
              <input id="connector-layer" type="checkbox" checked />
              <span>Panel DIN / DOUT + direction</span>
            </label>
            <label class="toggle-field">
              <input id="wiring-layer" type="checkbox" checked />
              <span>Panel-to-panel wiring</span>
            </label>
            <label class="toggle-field">
              <input id="panel-labels" type="checkbox" checked />
              <span>Panel IDs</span>
            </label>
            <label class="toggle-field">
              <input id="printable-layer" type="checkbox" checked />
              <span>Exact Manifold closures + screw tabs</span>
            </label>
            </div>
            <div class="view-settings">
              <div class="panel-transform-control">
                <span>Panel transform</span>
                <button id="panel-transform-mode" class="panel-transform-toggle" type="button"
                  data-mode="surface" aria-pressed="false"
                  aria-label="Panel transform: move along surface" title="Move along surface">
                  <span class="panel-transform-toggle__option" data-transform-icon="plane" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Zm0 4.5 9 4.5 9-4.5M3 17.5 12 22l9-4.5" />
                    </svg>
                    <small>Plane</small>
                  </span>
                  <span class="panel-transform-toggle__option" data-transform-icon="world" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3c3 2.6 4.5 5.6 4.5 9S15 18.4 12 21M12 3C9 5.6 7.5 8.6 7.5 12S9 18.4 12 21" />
                    </svg>
                    <small>World</small>
                  </span>
                </button>
              </div>
              <label class="field view-settings__display">
                <select id="display-mode" aria-label="Display">
                  <option value="wled">WLED framebuffer</option>
                  <option value="physical-index">Physical index bands</option>
                  <option value="logical-index">Logical index bands</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section class="control-section toolbox-section" data-toolbox="shape">
          <div class="toolbox-heading">
            <div><strong>Shape</strong><small>Authoring surface and scale</small></div>
          </div>
          <p class="toolbox-hint">Load a watertight GLB when the fixture layout uses a placement surface. Saved poses remain usable without one.</p>
          <div class="shape-controls">
            <label class="field">
              <span>GLB units to millimetres</span>
              <input id="surface-scale" type="number" min="0.000001" step="any" value="1000" />
            </label>
            <button id="load-design-surface" class="editor-button" type="button">GLB</button>
          </div>
        </section>

        <section class="control-section toolbox-section" data-toolbox="fixtures">
          <div class="toolbox-heading">
            <div><strong>Fixtures</strong><small>Place and edit emitters</small></div>
          </div>
          <p class="toolbox-hint">Edit every saved fixture pose. Surface placement stays unavailable when the selected carrier does not support it.</p>
          <div id="automatic-panel-placement-controls">
            <label class="field">
              <span>Target panel count</span>
              <input id="automatic-panel-count" type="number" min="1" step="1" value="30" />
            </label>
            <button id="automatically-place-panels" class="editor-button" type="button" disabled>Automatically place panels</button>
          </div>
          <div id="add-panel-controls" hidden>
            <label class="field"><span>Available closure face</span><select id="add-panel-face"></select></label>
            <button id="add-panel" class="editor-button" type="button" hidden>Add panel to selected face</button>
          </div>
        </section>

        <section class="control-section toolbox-section" data-toolbox="mapping">
          <div class="toolbox-heading">
            <div><strong>Mapping</strong><small>Addresses, route, and external control</small></div>
          </div>
          <p id="wiring-optimization-summary" class="mapping-note"></p>
          <button id="optimize-wiring" class="editor-button" type="button">Optimize wiring</button>
          <button id="open-physical-route-review" class="editor-button" type="button" disabled>Review physical wiring</button>
          <p id="physical-route-review-availability" class="mapping-note">Connect the configured ESP32 to review its installed panel order.</p>
          <button id="download-madmapper-package" class="editor-button" type="button">Download MadMapper ZIP</button>
          <button id="madmapper-preview" class="editor-button" type="button">Start MadMapper preview</button>
          <output id="madmapper-preview-status" class="mapping-note" aria-live="polite">Stopped</output>
          <div id="controller-position-section" class="controller-position-controls">
            <p id="controller-position-status" class="mapping-note"></p>
            <button id="reset-controller-position" class="editor-button" type="button">Use suggested position</button>
          </div>
          <details id="route-editor-section" class="compact-menu route-editor-section" hidden>
            <summary>Advanced route editor</summary>
            <div class="compact-menu__content">
              <div class="section-heading editor-subheading">
                <span>Wiring route editor</span>
                <small>controller to DIN to DOUT</small>
              </div>
              <p id="route-editor-note" class="mapping-note"></p>
              <div id="route-editor" class="route-editor" aria-label="Panel wiring route editor"></div>
              <button id="route-action" class="editor-button" type="button">Edit suggested route</button>
            </div>
          </details>
        </section>

        <section class="control-section toolbox-section" data-toolbox="fabrication">
          <div class="toolbox-heading">
            <div><strong>Fabrication</strong><small>Generate, label, assemble, and test</small></div>
          </div>
          <div class="fabrication-stage">
            <div class="fabrication-stage__heading">
              <strong>1. Generate parts</strong>
              <small>Choose settings, then generate the printable method supported by the loaded fixtures.</small>
            </div>
            <details id="advanced-tools" class="compact-menu">
              <summary>Fabrication settings</summary>
              <div class="compact-menu__content">
                <div id="structural-connector-settings" class="connector-settings">
                  <strong>Modular connector settings</strong>
                  <label class="field">
                    <span>Maximum automatic neighbor distance (mm)</span>
                    <input id="connector-neighbor-distance" type="number" min="1" step="1" value="140" />
                  </label>
                  <label class="field">
                    <span>Maximum automatic neighbors per panel</span>
                    <input id="connector-neighbor-degree" type="number" min="1" step="1" value="2" />
                  </label>
                  <div class="connector-bed-grid">
                    <label class="field"><span>Bed X (mm)</span><input id="connector-bed-x" type="number" min="1" step="1" value="250" /></label>
                    <label class="field"><span>Bed Y (mm)</span><input id="connector-bed-y" type="number" min="1" step="1" value="250" /></label>
                    <label class="field"><span>Bed Z (mm)</span><input id="connector-bed-z" type="number" min="1" step="1" value="250" /></label>
                  </div>
                  <label class="field">
                    <span>Reserved keyed-split length (not active)</span>
                    <input id="connector-segment-length" type="number" min="1" step="1" value="220" disabled title="Oversize loft bodies currently fail the print-envelope check." />
                  </label>
                  <div class="connector-pair-add">
                    <select id="connector-pair-first" aria-label="First panel"></select>
                    <select id="connector-pair-second" aria-label="Second panel"></select>
                    <button id="include-connector-pair" class="editor-button" type="button">Include panel pair</button>
                  </div>
                  <div id="connector-pair-list" class="connector-pair-list"></div>
                </div>
              </div>
            </details>
            <div class="pipeline-actions">
              <button id="assembly-package" class="pipeline-button" type="button">Generate panel closures</button>
              <button id="generate-structure" class="pipeline-button" type="button">Generate connector ribbons</button>
              <button id="generate-surface-structure" class="pipeline-button" type="button">Generate LED-surface bridges</button>
            </div>
          </div>
          <div class="fabrication-stage">
            <div class="fabrication-stage__heading">
              <strong>2. Download fabrication ZIP</strong>
              <small>Download the panel labels, manufacturing manual, and every current verified 3D-print file.</small>
            </div>
            <button id="download-panel-labels" class="pipeline-button" type="button">Download fabrication ZIP</button>
          </div>
          <div class="fabrication-stage">
            <div class="fabrication-stage__heading">
              <strong>3. Solder and assemble</strong>
              <small>Isolate one data chain and follow each controller-to-panel and panel-to-panel cable.</small>
            </div>
            <div id="assembly-tutorial-section" class="assembly-tutorial assembly-tutorial--workflow">
              <p id="assembly-tutorial-warning" class="assembly-tutorial__warning"></p>
              <p id="assembly-tutorial-instruction" class="assembly-tutorial__instruction">Isolate a data chain and step through each panel or cable in order.</p>
              <button id="assembly-tutorial-start" class="editor-button assembly-tutorial__start" type="button">Isolate chain</button>
              <div id="assembly-tutorial-controls" class="assembly-tutorial__controls" hidden>
                <output id="assembly-tutorial-step">Cable</output>
                <div class="assembly-tutorial__actions">
                  <button id="assembly-tutorial-previous-chain" type="button">Previous chain</button>
                  <button id="assembly-tutorial-next-chain" type="button">Next chain</button>
                  <button id="assembly-tutorial-previous-panel" type="button">Previous panel</button>
                  <button id="assembly-tutorial-next-panel" type="button">Next panel</button>
                  <button id="assembly-tutorial-previous-wire" type="button">Previous wire</button>
                  <button id="assembly-tutorial-next-wire" type="button">Next wire</button>
                  <button id="assembly-tutorial-exit" class="assembly-tutorial__exit" type="button">Show all</button>
                </div>
              </div>
            </div>
          </div>
          <div class="fabrication-stage">
            <div class="fabrication-stage__heading">
              <strong>4. Test on ESP32</strong>
              <small>Flash the approved ESP32 firmware and copy the loaded simulator mapping and animation.</small>
            </div>
            <button id="open-esp32-setup" class="editor-button" type="button">Set up ESP32</button>
          </div>
        </section>

        <section class="control-section utilities-section">
          <details id="developer-utilities" class="compact-menu">
            <summary>Developer utilities</summary>
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
              <button id="toggle-wiring-rotation-gate" class="editor-button" type="button" aria-pressed="false">Use current poses + 0/180° gate</button>
            </div>
          </details>
          <div id="pipeline-status" class="pipeline-status pipeline-status--history" role="log" aria-live="polite" aria-label="Activity log">
            Local Vite pipeline is ready.
          </div>
        </section>
      </aside>
    </main>
    <dialog id="project-library-dialog" class="project-library-dialog">
      <form method="dialog" class="project-library-shell">
        <header class="project-library-header">
          <div><strong>Project Library</strong><small>Open, save, back up, and transfer projects</small></div>
          <button id="close-project-library" class="editor-button" value="cancel">Close</button>
        </header>
        <p id="project-library-status" class="project-library-status">Open a project ZIP.</p>
        <div id="project-library-grid" class="project-library-grid" aria-live="polite"></div>
        <div class="project-library-tools">
          <label class="field project-library-save-as">
            <span>Project filename</span>
            <input id="project-library-filename" type="text" maxlength="188" spellcheck="false" />
          </label>
          <section class="project-library-tool-group">
            <strong>Save in this LOO/UME installation</strong>
            <small>Stores a reusable project ZIP in the server's local project library.</small>
            <div class="project-library-actions">
              <button id="save-project-as" class="pipeline-button" type="button">Save new library copy</button>
            </div>
          </section>
          <section class="project-library-tool-group">
            <strong>Open or import</strong>
            <small>Open a project from this computer without adding it to the library.</small>
            <div class="project-library-actions">
              <button id="open-project-file" class="pipeline-button" type="button">Open JSON or ZIP</button>
              <button id="open-project-folder" class="editor-button" type="button">Open folder</button>
            </div>
          </section>
          <section class="project-library-tool-group">
            <strong>Download or inspect</strong>
            <small>Downloads files through this browser. It does not add them to the library.</small>
            <div class="project-library-actions">
              <button id="save-project" class="pipeline-button" type="button">Download complete project ZIP</button>
              <button id="export-project-folder" class="editor-button" type="button">Download editable folder</button>
              <button id="save-sculpture-file" class="editor-button" type="button">Download sculpture JSON only</button>
            </div>
          </section>
        </div>
      </form>
    </dialog>
    <dialog id="physical-route-review-dialog" class="physical-route-review-dialog">
      <div class="physical-route-review-shell">
        <div class="section-heading"><span>Review physical wiring</span><small>Address-only calibration</small></div>
        <p class="mapping-note">Only one physical panel is lit. Green marks DIN and the gradient runs toward purple at DOUT. Confirm the expected panel, or click the actual virtual panel, set its address orientation, and confirm.</p>
        <output id="physical-route-review-step" class="physical-route-review-step"></output>
        <div id="physical-route-review-current" class="physical-route-review-current"></div>
        <div id="physical-route-review-controls" class="physical-route-review-controls">
          <button id="physical-route-review-previous" class="editor-button" type="button">Previous physical panel</button>
          <button id="physical-route-review-confirm" class="pipeline-button" type="button">OK — panel matches</button>
          <button id="physical-route-review-rotate-left" class="editor-button" type="button" aria-label="Rotate address mapping 90 degrees counter-clockwise">↶ 90°</button>
          <button id="physical-route-review-rotate-right" class="editor-button" type="button" aria-label="Rotate address mapping 90 degrees clockwise">↷ 90°</button>
        </div>
        <section id="physical-route-review-summary" class="physical-route-review-summary" hidden>
          <strong>Review complete</strong>
          <p id="physical-route-review-summary-note"></p>
          <ol id="physical-route-review-change-list"></ol>
          <button id="physical-route-review-summary-back" class="editor-button" type="button">Review last panel</button>
        </section>
        <div class="dialog-actions">
          <button id="physical-route-review-apply" class="pipeline-button" type="button" hidden>Apply and regenerate mapping</button>
          <button id="physical-route-review-cancel" class="editor-button" type="button">Cancel</button>
        </div>
      </div>
    </dialog>
    <dialog id="esp32-setup-dialog" class="esp32-setup-dialog">
      <form method="dialog" class="esp32-setup-form">
        <div class="section-heading"><span>Set up ESP32</span><small>USB + Wi-Fi</small></div>
        <label class="field">
          <span>2.4 GHz Wi-Fi name</span>
          <input id="esp32-wifi-ssid" type="text" maxlength="32" autocomplete="off" />
        </label>
        <label class="field">
          <span>Wi-Fi password</span>
          <input id="esp32-wifi-password" type="password" maxlength="64" autocomplete="new-password" />
        </label>
        <label class="field">
          <span>Approved full-flash image (only if not staged locally)</span>
          <input id="esp32-firmware-file" type="file" accept=".bin,application/octet-stream" />
        </label>
        <div class="esp32-boot-instruction">
          <output id="esp32-boot-instruction" data-state="hold">HOLD BOOT</output>
          <small>Keep only this ESP32/CP2102 connected. Hold before selection; release when this instruction changes.</small>
        </div>
        <div class="esp32-progress" aria-label="ESP32 flash progress">
          <div><span>Flash progress</span><output id="esp32-setup-progress-label">Ready</output></div>
          <progress id="esp32-setup-progress" max="100" value="0"></progress>
        </div>
        <div id="esp32-setup-console" class="pipeline-status esp32-setup-console" role="log" aria-live="polite" aria-label="ESP32 setup console">
          Local editor is ready.
        </div>
        <div class="dialog-actions">
          <button id="run-esp32-setup" class="pipeline-button" type="button">Flash and configure</button>
          <button id="close-esp32-setup" class="editor-button" type="button">Cancel</button>
        </div>
      </form>
    </dialog>
  </div>
`;

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const viewerElement = query<HTMLDivElement>("#viewer");
const applicationUpdateNotice = query<HTMLElement>("#application-update-notice");
const applicationUpdateMessage = query<HTMLElement>("#application-update-message");
const applyApplicationUpdateButton =
  query<HTMLButtonElement>("#apply-application-update");
const effectSelect = query<HTMLSelectElement>("#effect");
const paletteSelect = query<HTMLSelectElement>("#palette");
const previousEffectButton = query<HTMLButtonElement>("#previous-effect");
const nextEffectButton = query<HTMLButtonElement>("#next-effect");
const previousPaletteButton = query<HTMLButtonElement>("#previous-palette");
const nextPaletteButton = query<HTMLButtonElement>("#next-palette");
const speedInput = query<HTMLInputElement>("#speed");
const speedValue = query<HTMLOutputElement>("#speed-value");
const intensityInput = query<HTMLInputElement>("#intensity");
const intensityValue = query<HTMLOutputElement>("#intensity-value");
const sculptureSelect = query<HTMLSelectElement>("#sculpture-select");
const openProjectLibraryButton = query<HTMLButtonElement>("#open-project-library");
const projectLibraryDialog = query<HTMLDialogElement>("#project-library-dialog");
const projectLibraryGrid = query<HTMLElement>("#project-library-grid");
const projectLibraryStatus = query<HTMLElement>("#project-library-status");
const saveLibraryProjectButton = query<HTMLButtonElement>("#save-library-project");
const saveProjectAsButton = query<HTMLButtonElement>("#save-project-as");
const projectLibraryFilenameInput = query<HTMLInputElement>("#project-library-filename");
const currentProjectName = query<HTMLOutputElement>("#current-project-name");
const sculptureJsonInput = query<HTMLInputElement>("#sculpture-json");
const loadSculptureButton = query<HTMLButtonElement>("#load-sculpture");
const developerUtilities = query<HTMLDetailsElement>("#developer-utilities");
const ledCountInput = query<HTMLInputElement>("#led-count");
const applyCountButton = query<HTMLButtonElement>("#apply-count");
const toggleWiringRotationGateButton =
  query<HTMLButtonElement>("#toggle-wiring-rotation-gate");
const displayMode = query<HTMLSelectElement>("#display-mode");
const panelLabelsToggle = query<HTMLInputElement>("#panel-labels");
const printableLayerToggle = query<HTMLInputElement>("#printable-layer");
const connectorLayerToggle =
  query<HTMLInputElement>("#connector-layer");
const wiringLayerToggle = query<HTMLInputElement>("#wiring-layer");
const wiringLayerControls = query<HTMLElement>("#wiring-layer-controls");
const assemblyTutorialWarning =
  query<HTMLElement>("#assembly-tutorial-warning");
const assemblyTutorialInstruction =
  query<HTMLElement>("#assembly-tutorial-instruction");
const assemblyTutorialStartButton =
  query<HTMLButtonElement>("#assembly-tutorial-start");
const assemblyTutorialControls =
  query<HTMLElement>("#assembly-tutorial-controls");
const assemblyTutorialStep =
  query<HTMLOutputElement>("#assembly-tutorial-step");
const assemblyTutorialPreviousChainButton =
  query<HTMLButtonElement>("#assembly-tutorial-previous-chain");
const assemblyTutorialNextChainButton =
  query<HTMLButtonElement>("#assembly-tutorial-next-chain");
const assemblyTutorialPreviousPanelButton =
  query<HTMLButtonElement>("#assembly-tutorial-previous-panel");
const assemblyTutorialNextPanelButton =
  query<HTMLButtonElement>("#assembly-tutorial-next-panel");
const assemblyTutorialPreviousWireButton =
  query<HTMLButtonElement>("#assembly-tutorial-previous-wire");
const assemblyTutorialNextWireButton =
  query<HTMLButtonElement>("#assembly-tutorial-next-wire");
const assemblyTutorialExitButton =
  query<HTMLButtonElement>("#assembly-tutorial-exit");
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
const wiringOptimizationSummary =
  query<HTMLElement>("#wiring-optimization-summary");
const optimizeWiringButton = query<HTMLButtonElement>("#optimize-wiring");
const routeEditorNote = query<HTMLElement>("#route-editor-note");
const routeEditor = query<HTMLElement>("#route-editor");
const routeActionButton = query<HTMLButtonElement>("#route-action");
const controllerPositionStatus = query<HTMLElement>("#controller-position-status");
const resetControllerPositionButton =
  query<HTMLButtonElement>("#reset-controller-position");
const designSurfaceFileInput =
  query<HTMLInputElement>("#design-surface-file");
const loadDesignSurfaceButton =
  query<HTMLButtonElement>("#load-design-surface");
const surfaceScaleInput = query<HTMLInputElement>("#surface-scale");
const automaticPanelPlacementControls =
  query<HTMLElement>("#automatic-panel-placement-controls");
const automaticPanelCountInput =
  query<HTMLInputElement>("#automatic-panel-count");
const automaticallyPlacePanelsButton =
  query<HTMLButtonElement>("#automatically-place-panels");
const addPanelFaceSelect = query<HTMLSelectElement>("#add-panel-face");
const addPanelButton = query<HTMLButtonElement>("#add-panel");
const addPanelControls = query<HTMLElement>("#add-panel-controls");
const assemblyPackageButton = query<HTMLButtonElement>("#assembly-package");
const generateStructureButton =
  query<HTMLButtonElement>("#generate-structure");
const generateSurfaceStructureButton =
  query<HTMLButtonElement>("#generate-surface-structure");
const connectorSettings = query<HTMLElement>("#structural-connector-settings");
const connectorNeighborDistanceInput = query<HTMLInputElement>("#connector-neighbor-distance");
const connectorNeighborDegreeInput = query<HTMLInputElement>("#connector-neighbor-degree");
const connectorBedInputs = [
  query<HTMLInputElement>("#connector-bed-x"),
  query<HTMLInputElement>("#connector-bed-y"),
  query<HTMLInputElement>("#connector-bed-z"),
] as const;
const connectorSegmentLengthInput = query<HTMLInputElement>("#connector-segment-length");
const connectorPairFirstSelect = query<HTMLSelectElement>("#connector-pair-first");
const connectorPairSecondSelect = query<HTMLSelectElement>("#connector-pair-second");
const includeConnectorPairButton = query<HTMLButtonElement>("#include-connector-pair");
const connectorPairList = query<HTMLElement>("#connector-pair-list");
const panelTransformMode = query<HTMLButtonElement>("#panel-transform-mode");
const pipelineStatus = query<HTMLElement>("#pipeline-status");
const esp32SetupConsole = query<HTMLElement>("#esp32-setup-console");
const esp32SetupDialog = query<HTMLDialogElement>("#esp32-setup-dialog");
const openEsp32SetupButton = query<HTMLButtonElement>("#open-esp32-setup");
const downloadMadMapperPackageButton =
  query<HTMLButtonElement>("#download-madmapper-package");
const downloadPanelLabelsButton =
  query<HTMLButtonElement>("#download-panel-labels");
const madMapperPreviewButton = query<HTMLButtonElement>("#madmapper-preview");
const madMapperPreviewStatus = query<HTMLOutputElement>("#madmapper-preview-status");
const controlPanel = query<HTMLElement>(".control-panel");
const openPhysicalRouteReviewButton =
  query<HTMLButtonElement>("#open-physical-route-review");
const physicalRouteReviewAvailability =
  query<HTMLElement>("#physical-route-review-availability");
const physicalRouteReviewDialog =
  query<HTMLDialogElement>("#physical-route-review-dialog");
const physicalRouteReviewStep =
  query<HTMLOutputElement>("#physical-route-review-step");
const physicalRouteReviewCurrent =
  query<HTMLElement>("#physical-route-review-current");
const physicalRouteReviewControls =
  query<HTMLElement>("#physical-route-review-controls");
const physicalRouteReviewPreviousButton =
  query<HTMLButtonElement>("#physical-route-review-previous");
const physicalRouteReviewConfirmButton =
  query<HTMLButtonElement>("#physical-route-review-confirm");
const physicalRouteReviewRotateLeftButton =
  query<HTMLButtonElement>("#physical-route-review-rotate-left");
const physicalRouteReviewRotateRightButton =
  query<HTMLButtonElement>("#physical-route-review-rotate-right");
const physicalRouteReviewSummary =
  query<HTMLElement>("#physical-route-review-summary");
const physicalRouteReviewSummaryNote =
  query<HTMLElement>("#physical-route-review-summary-note");
const physicalRouteReviewChangeList =
  query<HTMLOListElement>("#physical-route-review-change-list");
const physicalRouteReviewSummaryBackButton =
  query<HTMLButtonElement>("#physical-route-review-summary-back");
const physicalRouteReviewApplyButton =
  query<HTMLButtonElement>("#physical-route-review-apply");
const physicalRouteReviewCancelButton =
  query<HTMLButtonElement>("#physical-route-review-cancel");
const runEsp32SetupButton = query<HTMLButtonElement>("#run-esp32-setup");
const closeEsp32SetupButton = query<HTMLButtonElement>("#close-esp32-setup");
const esp32WifiSsidInput = query<HTMLInputElement>("#esp32-wifi-ssid");
const esp32WifiPasswordInput = query<HTMLInputElement>("#esp32-wifi-password");
const esp32FirmwareInput = query<HTMLInputElement>("#esp32-firmware-file");
const esp32SetupProgress = query<HTMLProgressElement>("#esp32-setup-progress");
const esp32SetupProgressLabel = query<HTMLOutputElement>("#esp32-setup-progress-label");
const esp32BootInstruction = query<HTMLOutputElement>("#esp32-boot-instruction");
const appendLogEntry = (
  target: HTMLElement,
  message: string,
  error: boolean,
): void => {
  const entry = document.createElement("div");
  entry.className = error ? "esp32-console-entry esp32-console-entry--error" : "esp32-console-entry";
  entry.textContent = message;
  target.append(entry);
  while (target.childElementCount > 240) target.firstElementChild?.remove();
  target.scrollTop = target.scrollHeight;
};
const setLogMessage = (message: string, error = false): void => {
  const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const timestampedMessage = `[${timestamp}] ${message}`;
  pipelineStatus.classList.toggle("pipeline-status--error", error);
  appendLogEntry(pipelineStatus, timestampedMessage, error);
  appendLogEntry(esp32SetupConsole, timestampedMessage, error);
};
const browserBundleName = decodeURIComponent(
  new URL(import.meta.url).pathname.split("/").pop() ?? import.meta.url,
);
console.info(`[LOO/UME] Browser bundle: ${browserBundleName}`);
let pipelineAvailable = false;
let pipelineAvailabilityMessage =
  "Checking local Manifold availability. Mapping and wiring remain available.";
assemblyPackageButton.disabled = true;
pipelineStatus.textContent = pipelineAvailabilityMessage;

let renderer: SphereRenderer | undefined;
let animationFrame = 0;

interface ApplicationUpdateStatus {
  updateAvailable: boolean;
  canApply: boolean;
  localChanges: boolean;
  message: string;
}

async function loadApplicationUpdateStatus(): Promise<ApplicationUpdateStatus | null> {
  try {
    const response = await fetch("./api/application-update", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as ApplicationUpdateStatus;
  } catch {
    return null;
  }
}

async function showAvailableApplicationUpdate(): Promise<void> {
  const status = await loadApplicationUpdateStatus();
  if (!status?.updateAvailable) return;
  applicationUpdateNotice.hidden = false;
  applicationUpdateMessage.textContent = status.message;
  applyApplicationUpdateButton.disabled = !status.canApply;
  if (!status.canApply) {
    applyApplicationUpdateButton.title = "Run ./bootstrap.sh update in the installation checkout.";
  }
}

async function waitForUpdatedApplication(): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 2_000));
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(`./?update-probe=${Date.now()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch {
      // The old local server is stopping or the updated build is starting.
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  applicationUpdateMessage.textContent =
    "The update did not restart automatically. Run ./bootstrap.sh launch.";
  applyApplicationUpdateButton.disabled = false;
}

applyApplicationUpdateButton.addEventListener("click", () => {
  void (async () => {
    applyApplicationUpdateButton.disabled = true;
    applicationUpdateMessage.textContent =
      "Preserving local projects and updating LOO/UME…";
    const response = await fetch("./api/application-update", { method: "POST" });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Application update failed.");
    applicationUpdateMessage.textContent = result.message ??
      "LOO/UME updated. Restarting…";
    await waitForUpdatedApplication();
  })().catch((error) => {
    applicationUpdateMessage.textContent = error instanceof Error
      ? error.message
      : String(error);
    applyApplicationUpdateButton.disabled = false;
  });
});

void showAvailableApplicationUpdate();

async function start(): Promise<void> {
  try {
    const generatorStatusPromise = loadGeneratorStatus();
    const [sculptureRegistry, initialProjectLibraryRegistry] = await Promise.all([
      loadSculptureRegistry(),
      loadProjectLibraryRegistry(),
    ]);
    let projectLibraryRegistry = initialProjectLibraryRegistry;
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
    currentProjectName.textContent = loadedSculpture.definition.name;
    let editorDefinition = loadedSculpture.definition;
    let editorProject = loadedSculpture.project;
    let selectedHardwareContract = loadedSculpture.contract;
    let hardwareContract = selectedHardwareContract;
    const engine = await WledEngine.create(
      hardwareContract.mapping.entries.length,
    );
    let wiringPreview = hardwareContract.wiring;
    let mapping = hardwareContract.mapping;
    let assemblyTutorialModel: AssemblyTutorialModel =
      createAssemblyTutorialModel(wiringPreview);
    let assemblyTutorialActive = false;
    let assemblyTutorialChainIndex = 0;
    let assemblyTutorialConnectionIndex: number | null = null;
    let assemblyTutorialPanelIndex: number | null = null;
    let assemblyTutorialOutputVisibility: Map<number, boolean> | null = null;
    const outputLayerVisibility = new Map<number, boolean>();
    let routeEditorModel: WiringRouteEditorModel | null =
      createWiringRouteEditorModel(editorDefinition, wiringPreview);
    renderer = new SphereRenderer(viewerElement, mapping, editorProject.panelProfile);
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

    let simulationTime = 0;
    let previousTime = performance.now();
    let currentDisplayMode: DisplayMode = "wled";
    let activePlacementSurface: {
      surface: LoadedDesignSurface;
      attachmentSurface: "design-surface" | "mechanical-shell";
    } | undefined;
    let verifiedGeneratedMechanics: VerifiedGeneratedMechanics | undefined;
    let verifiedGeneratedStructure: VerifiedGeneratedStructure | undefined;
    let generatedAssetLoadRevision = 0;
    let activePortableBundle: PortableProjectBundle | undefined;
    let availableProjectAssets = new Map<string, Uint8Array>();
    let generatedMemoryUrls = new Map<string, string>();
    let selectedEditorPanelId: string | null = null;
    let simulatorDeviceUrl: URL | undefined;
    let simulatorFrameRequest: Promise<void> | undefined;
    let simulatorReconnectRequest: Promise<void> | undefined;
    let nextSimulatorFrameAt = 0;
    let simulatorLinkFailed = false;
    let standaloneSaveTimer: ReturnType<typeof setTimeout> | undefined;
    let standaloneSaveRequest: Promise<void> | undefined;
    let simulatorProjectRevision = 0;
    let simulatorSetupActive = false;
    let simulatorLedmapUpdateAuthorized = false;
    let simulatorReconnectEnabled = false;
    let physicalRouteReviewSession: PhysicalRouteReviewSession | undefined;
    let physicalRouteReviewDeviceUrl: URL | undefined;
    let physicalRouteReviewOriginalSelection: string | null = null;
    let physicalRouteReviewFrameRequest: Promise<void> | undefined;
    let physicalRouteReviewProgrammaticSelection = false;
    let physicalRouteReviewApplying = false;
    let physicalRouteReviewDemo = false;
    let physicalRouteReviewDemoPixels: Uint32Array | undefined;
    let physicalRouteReviewPendingApply: {
      session: PhysicalRouteReviewSession;
      deviceUrl: URL;
      reviewedSculpture: LoadedSculpture;
    } | undefined;
    const artNetPreviewClient = new ArtNetPreviewClient();
    let artNetPreviewPixels: Uint32Array | undefined;
    let artNetPreviewLastFrameAt = 0;
    let artNetPreviewTimedOut = false;
    let artNetPreviewRevision = 0;
    let artNetPreviewFrameTimes: number[] = [];

    const stopMadMapperPreview = (message?: string): void => {
      artNetPreviewRevision += 1;
      artNetPreviewClient.stop();
      artNetPreviewPixels = undefined;
      artNetPreviewLastFrameAt = 0;
      artNetPreviewFrameTimes = [];
      artNetPreviewTimedOut = false;
      madMapperPreviewButton.textContent = "Start MadMapper preview";
      madMapperPreviewStatus.textContent = "Stopped";
      if (message) setLogMessage(message);
    };

    const startMadMapperPreview = (): void => {
      if (artNetPreviewClient.active) {
        stopMadMapperPreview("MadMapper preview stopped. Native simulation resumed.");
        return;
      }
      if (!hardwareContract.readiness.mappingReady) {
        throw new Error("Confirm the authored route and panel addressing before preview.");
      }
      const revision = ++artNetPreviewRevision;
      const expectedFingerprint = hardwareContract.fingerprint;
      artNetPreviewPixels = undefined;
      artNetPreviewFrameTimes = [];
      artNetPreviewTimedOut = false;
      madMapperPreviewButton.textContent = "Stop MadMapper preview";
      madMapperPreviewStatus.textContent = "Waiting for Art-Net on 127.0.0.1:6454";
      const endUniverse = Math.ceil(hardwareContract.mapping.entries.length / 170);
      setLogMessage(
        `MadMapper preview is listening on 127.0.0.1:6454, universes 1 through ${endUniverse}.`,
      );
      void artNetPreviewClient.start({
        pixelCount: hardwareContract.mapping.entries.length,
        startUniverse: 1,
        mappingFingerprint: expectedFingerprint,
        onFrame: (frame) => {
          if (
            revision !== artNetPreviewRevision ||
            hardwareContract.fingerprint !== expectedFingerprint
          ) return;
          artNetPreviewPixels = physicalRgbToLogicalPixels(
            frame.physicalRgb,
            hardwareContract.mapping.entries,
          );
          artNetPreviewLastFrameAt = performance.now();
          artNetPreviewTimedOut = false;
          artNetPreviewFrameTimes.push(artNetPreviewLastFrameAt);
          artNetPreviewFrameTimes = artNetPreviewFrameTimes.filter(
            (time) => artNetPreviewLastFrameAt - time < 1_000,
          );
          madMapperPreviewStatus.textContent =
            `${artNetPreviewFrameTimes.length} FPS · ${frame.universeCount} universes · ` +
            `${frame.incompleteFrames} incomplete · ${frame.rejectedPackets} rejected`;
        },
      }).catch((error) => {
        if (revision !== artNetPreviewRevision) return;
        stopMadMapperPreview();
        setLogMessage(
          `MadMapper preview failed: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      });
    };

    const reconnectStorage = (): Storage | undefined => {
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    };

    const loadedSimulatorDeployment = (): {
      outputs: Array<{ startIndex: number; pixelCount: number; gpio: number }>;
      ledCount: number;
      panelCount: number;
    } => {
      const columns = mapping.panelPixelGrid?.columns;
      const rows = mapping.panelPixelGrid?.rows;
      const pixelsPerFixture = (columns ?? 0) * (rows ?? 0);
      if (
        mapping.topology !== "panelized-sculpture" ||
        !Number.isInteger(columns) ||
        !Number.isInteger(rows) ||
        columns! < 1 ||
        rows! < 1
      ) {
        throw new Error("ESP32 setup requires a loaded panelized simulator.");
      }
      const ledCount = mapping.entries.length;
      const panelCount = mapping.panels.length;
      if (
        panelCount < 1 ||
        panelCount > 41 ||
        ledCount !== panelCount * pixelsPerFixture ||
        hardwareContract.outputs.length < 1 ||
        hardwareContract.outputs.length > 4
      ) {
        throw new Error(
          "ESP32 setup supports 1 through 41 complete panels on one through four outputs.",
        );
      }
      const defaultGpios = [16, 17, 18, 19];
      const outputs = hardwareContract.outputs.map((output, index) => ({
        startIndex: output.startIndex,
        pixelCount: output.pixelCount,
        gpio: output.gpio ?? defaultGpios[index]!,
      }));
      if (
        outputs.some((output, index) =>
          !isApprovedEsp32OutputGpio(output.gpio) ||
          output.startIndex !== outputs
            .slice(0, index)
            .reduce((sum, prior) => sum + prior.pixelCount, 0) ||
          output.pixelCount < pixelsPerFixture ||
          output.pixelCount % pixelsPerFixture !== 0
        ) ||
        new Set(outputs.map((output) => output.gpio)).size !== outputs.length ||
        outputs.reduce((sum, output) => sum + output.pixelCount, 0) !== ledCount
      ) {
        throw new Error("The loaded simulator does not have a contiguous approved ESP32 output layout.");
      }
      return { outputs, ledCount, panelCount };
    };
    const physicalSimulatorFramebuffer = (): Array<[number, number, number]> => {
      const { ledCount } = loadedSimulatorDeployment();
      return mappedPanelFramebuffer(
        engine.pixels,
        hardwareContract.mapping.entries,
        0,
        ledCount,
      );
    };
    const setupPayload = (): Esp32SetupPayload => {
      const { outputs, ledCount } = loadedSimulatorDeployment();
      const config = createSimulatorSetupConfig(
        smokeConfig as Record<string, unknown>,
        outputs,
        hardwareContract.wledColorOrder.wledValue,
        mapping.panelPixelGrid!.columns * mapping.panelPixelGrid!.rows,
      );
      return {
        sourceFingerprint: hardwareContract.fingerprint,
        sourceRevision: simulatorProjectRevision,
        allowLedmapUpdate: simulatorLedmapUpdateAuthorized,
        config,
        expectedLedCount: ledCount,
        ledmapBytes: JSON.stringify(hardwareContract.ledmap) + "\n",
        expectedEffectName: effectSelect.selectedOptions[0]?.text,
        expectedPaletteName: paletteSelect.selectedOptions[0]?.text,
        state: {
          on: true,
          bri: 128,
          tt: 0,
          seg: {
            id: 0,
            start: 0,
            stop: ledCount,
            fx: Number(effectSelect.value),
            pal: Number(paletteSelect.value),
            sx: Number(speedInput.value),
            ix: Number(intensityInput.value),
            frz: false,
            col: [[255, 122, 24], [5, 8, 22], [0, 0, 0]],
          },
        },
      };
    };

    const enableSimulatorLink = (deviceUrl: URL, reconnected = false): void => {
      const { outputs, ledCount, panelCount } = loadedSimulatorDeployment();
      simulatorDeviceUrl = deviceUrl;
      simulatorReconnectEnabled = true;
      rememberAutomaticEsp32Reconnect(reconnectStorage());
      simulatorLedmapUpdateAuthorized = false;
      nextSimulatorFrameAt = 0;
      simulatorLinkFailed = false;
      setLogMessage(
        `${reconnected ? "Reconnected" : "Standalone animation saved and live preview started"} at ${deviceUrl.host} for ${panelCount} panel${panelCount === 1 ? "" : "s"} (${ledCount} LEDs) on GPIO ${outputs.map((output) => output.gpio).join(", ")}.`,
      );
      updatePhysicalRouteReviewAvailability();
    };

    const updatePhysicalRouteReviewAvailability = (): void => {
      const available =
        hardwareContract.readiness.mappingReady &&
        !simulatorSetupActive &&
        physicalRouteReviewSession === undefined;
      openPhysicalRouteReviewButton.disabled = !available;
      physicalRouteReviewAvailability.textContent = physicalRouteReviewSession
        ? physicalRouteReviewDemo
          ? "Physical wiring review is active in virtual-only mode."
          : "Physical wiring review is active."
        : !hardwareContract.readiness.mappingReady
        ? "Regenerate mapping/wiring before reviewing physical panel order."
        : simulatorDeviceUrl
        ? `Ready to review ${hardwareContract.outputs.reduce((sum, output) => sum + output.panelIds.length, 0)} physical panels at ${simulatorDeviceUrl!.host}.`
        : "No ESP32 is connected. Review will run on the virtual sculpture only.";
    };
    updatePhysicalRouteReviewAvailability();

    const setPhysicalRouteReviewBusy = (busy: boolean): void => {
      for (const button of [
        physicalRouteReviewPreviousButton,
        physicalRouteReviewConfirmButton,
        physicalRouteReviewRotateLeftButton,
        physicalRouteReviewRotateRightButton,
        physicalRouteReviewSummaryBackButton,
      ]) button.disabled = busy;
    };

    const selectPhysicalRouteReviewPanel = (
      panelId: string | null,
      quarterTurnsClockwise: 0 | 1 | 2 | 3 = 0,
    ): void => {
      physicalRouteReviewProgrammaticSelection = true;
      renderer?.setPhysicalRouteReview(panelId, quarterTurnsClockwise);
      if (panelId === null) renderer?.selectEditorPanel(physicalRouteReviewOriginalSelection);
      physicalRouteReviewProgrammaticSelection = false;
    };

    const sendPhysicalRouteReviewFrame = async (
      pixels: Array<[number, number, number]>,
    ): Promise<void> => {
      if (physicalRouteReviewDemo) {
        physicalRouteReviewDemoPixels = physicalRgbToLogicalPixels(
          Uint8Array.from(pixels.flat()),
          hardwareContract.mapping.entries,
        );
        viewerElement.dataset.physicalRouteReviewDemoPixels = String(
          pixels.filter((pixel) => pixel.some((channel) => channel !== 0)).length,
        );
        return;
      }
      const deviceUrl = physicalRouteReviewDeviceUrl;
      if (!deviceUrl) throw new Error("The reviewed ESP32 connection is unavailable.");
      await physicalRouteReviewFrameRequest?.catch(() => undefined);
      const request = sendSimulatorFramebuffer(deviceUrl, pixels);
      physicalRouteReviewFrameRequest = request;
      try {
        await request;
      } finally {
        if (physicalRouteReviewFrameRequest === request) {
          physicalRouteReviewFrameRequest = undefined;
        }
      }
    };

    const showPhysicalRouteReviewSummary = async (): Promise<void> => {
      const session = physicalRouteReviewSession;
      if (!session) return;
      physicalRouteReviewControls.hidden = true;
      physicalRouteReviewSummary.hidden = false;
      physicalRouteReviewApplyButton.hidden = physicalRouteReviewDemo;
      physicalRouteReviewSummaryBackButton.disabled = false;
      selectPhysicalRouteReviewPanel(null);
      const changes = physicalRouteReviewChanges(session, editorDefinition);
      physicalRouteReviewSummaryNote.textContent = changes.length === 0
        ? physicalRouteReviewDemo
          ? "Demo complete. No project or device data changed."
          : "All physical panel identities and address orientations match the current project. Applying records the completed physical review."
        : physicalRouteReviewDemo
        ? `${changes.length} simulated mapping ${changes.length === 1 ? "change" : "changes"}. Demo mode cannot apply them.`
        : `${changes.length} mapping ${changes.length === 1 ? "change" : "changes"} will be applied. Panel poses and fabrication data will not change.`;
      physicalRouteReviewChangeList.replaceChildren(
        ...(changes.length === 0
          ? [Object.assign(document.createElement("li"), { textContent: "No route or orientation corrections." })]
          : changes.map((change) =>
            Object.assign(document.createElement("li"), { textContent: change })
          )),
      );
      await sendPhysicalRouteReviewFrame(
        Array.from({ length: session.ledCount }, () => [0, 0, 0] as [number, number, number]),
      );
    };

    const showPhysicalRouteReviewSlot = async (
      slotIndex: number,
      sendFrame = true,
    ): Promise<void> => {
      const session = physicalRouteReviewSession;
      if (!session) return;
      const slot = session.slots[slotIndex];
      if (!slot) {
        await showPhysicalRouteReviewSummary();
        return;
      }
      session.currentSlotIndex = slotIndex;
      physicalRouteReviewControls.hidden = false;
      physicalRouteReviewSummary.hidden = true;
      physicalRouteReviewApplyButton.hidden = true;
      physicalRouteReviewStep.value =
        `${slot.outputLabel} · physical panel ${slot.chainPosition + 1} · ` +
        `${slotIndex + 1} / ${session.slots.length}`;
      physicalRouteReviewCurrent.textContent =
        `Expected ${slot.expectedPanelId}. Assigned ${slot.panelId}. ` +
        `Address orientation ${slot.quarterTurnsClockwise * 90}° clockwise in PCB back view.`;
      const rotationDegrees = session.rotationStepQuarterTurns * 90;
      physicalRouteReviewRotateLeftButton.textContent = `↶ ${rotationDegrees}°`;
      physicalRouteReviewRotateRightButton.textContent = `↷ ${rotationDegrees}°`;
      physicalRouteReviewRotateLeftButton.setAttribute(
        "aria-label",
        `Rotate address mapping ${rotationDegrees} degrees counter-clockwise`,
      );
      physicalRouteReviewRotateRightButton.setAttribute(
        "aria-label",
        `Rotate address mapping ${rotationDegrees} degrees clockwise`,
      );
      selectPhysicalRouteReviewPanel(slot.panelId, slot.quarterTurnsClockwise);
      physicalRouteReviewPreviousButton.disabled = slotIndex === 0;
      if (!sendFrame) return;
      setPhysicalRouteReviewBusy(true);
      try {
        await sendPhysicalRouteReviewFrame(
          createPhysicalPanelReviewFrame(session, slotIndex),
        );
      } finally {
        setPhysicalRouteReviewBusy(false);
        physicalRouteReviewPreviousButton.disabled = slotIndex === 0;
      }
    };

    const advancePhysicalRouteReview = async (): Promise<void> => {
      const session = physicalRouteReviewSession;
      if (!session) return;
      const next = nextPhysicalRouteReviewSlot(session);
      if (next === null) await showPhysicalRouteReviewSummary();
      else await showPhysicalRouteReviewSlot(next);
    };

    const closePhysicalRouteReview = async (
      resumeLivePreview: boolean,
    ): Promise<void> => {
      const deviceUrl = physicalRouteReviewDeviceUrl;
      await physicalRouteReviewFrameRequest?.catch(() => undefined);
      physicalRouteReviewSession = undefined;
      physicalRouteReviewDeviceUrl = undefined;
      physicalRouteReviewApplying = false;
      physicalRouteReviewPendingApply = undefined;
      physicalRouteReviewDemo = false;
      physicalRouteReviewDemoPixels = undefined;
      delete viewerElement.dataset.physicalRouteReviewDemoPixels;
      appRoot.classList.remove("app--physical-route-review");
      controlPanel.inert = false;
      selectPhysicalRouteReviewPanel(null);
      physicalRouteReviewOriginalSelection = null;
      if (physicalRouteReviewDialog.open) physicalRouteReviewDialog.close();
      if (resumeLivePreview && deviceUrl && simulatorDeviceUrl) {
        try {
          await sendSimulatorFramebuffer(deviceUrl, physicalSimulatorFramebuffer());
        } catch (error) {
          setLogMessage(
            `Live preview did not resume: ${error instanceof Error ? error.message : String(error)}`,
            true,
          );
        }
      }
      updatePhysicalRouteReviewAvailability();
    };

    const beginPhysicalRouteReview = async (demo = false): Promise<void> => {
      if (!demo && !simulatorDeviceUrl) {
        throw new Error("Connect the configured ESP32 before reviewing physical wiring.");
      }
      if (!hardwareContract.readiness.mappingReady) {
        throw new Error("Regenerate mapping/wiring before reviewing physical wiring.");
      }
      exitAssemblyTutorial(false);
      if (artNetPreviewClient.active) {
        stopMadMapperPreview("MadMapper preview stopped for physical wiring review.");
      }
      if (standaloneSaveTimer) {
        clearTimeout(standaloneSaveTimer);
        standaloneSaveTimer = undefined;
      }
      await settleSimulatorDeviceWork([
        simulatorReconnectRequest,
        standaloneSaveRequest,
        simulatorFrameRequest,
      ]);
      physicalRouteReviewOriginalSelection = selectedEditorPanelId;
      physicalRouteReviewSession = createPhysicalRouteReviewSession(
        editorDefinition,
        hardwareContract,
      );
      physicalRouteReviewDemo = demo;
      physicalRouteReviewDemoPixels = undefined;
      physicalRouteReviewDeviceUrl = demo ? undefined : simulatorDeviceUrl;
      physicalRouteReviewPendingApply = undefined;
      physicalRouteReviewApplyButton.textContent = "Apply and regenerate mapping";
      physicalRouteReviewCancelButton.disabled = false;
      appRoot.classList.add("app--physical-route-review");
      controlPanel.inert = true;
      physicalRouteReviewDialog.show();
      physicalRouteReviewDialog.dataset.mode = demo ? "demo" : "device";
      updatePhysicalRouteReviewAvailability();
      await showPhysicalRouteReviewSlot(0);
      setLogMessage(
        demo
          ? "Physical wiring review demo started. The diagnostic panel is shown only in the virtual sculpture."
          : "Physical wiring review started. Only the selected physical panel is lit.",
      );
    };

    const scheduleStandaloneSave = (): void => {
      if (!simulatorDeviceUrl || simulatorSetupActive || physicalRouteReviewSession) return;
      if (standaloneSaveTimer) clearTimeout(standaloneSaveTimer);
      standaloneSaveTimer = setTimeout(() => {
        standaloneSaveTimer = undefined;
        if (!simulatorDeviceUrl) return;
        if (standaloneSaveRequest) {
          standaloneSaveTimer = setTimeout(scheduleStandaloneSave, 500);
          return;
        }
        const payload = setupPayload();
        const deviceUrl = simulatorDeviceUrl;
        const pendingFrame = simulatorFrameRequest?.catch(() => undefined) ?? Promise.resolve();
        standaloneSaveRequest = pendingFrame
          .then(() => persistStandaloneAnimation(deviceUrl, payload))
          .then(() => setLogMessage(
            "Saved the current animation as the ESP32 standalone boot preset.",
          ))
          .catch((error) => setLogMessage(
            `Standalone animation save failed: ${error instanceof Error ? error.message : String(error)}`,
            true,
          ))
          .finally(() => {
            standaloneSaveRequest = undefined;
          });
      }, 500);
    };

    const tryReconnectSimulatorLink = (): void => {
      if (
        !simulatorReconnectEnabled ||
        simulatorSetupActive ||
        physicalRouteReviewSession ||
        simulatorDeviceUrl ||
        simulatorReconnectRequest
      ) return;
      let reconnectPayload: Esp32SetupPayload;
      try {
        reconnectPayload = setupPayload();
      } catch {
        return;
      }
      const requestedRevision = simulatorProjectRevision;
      setLogMessage("Looking for loo-ume.local to reconnect the physical live preview.");
      const pendingDeviceWork = settleSimulatorDeviceWork([
        standaloneSaveRequest,
        simulatorFrameRequest,
      ]);
      simulatorReconnectRequest = pendingDeviceWork
        .then(() => connectExistingSimulatorDevice(reconnectPayload, {
          discoveryAttempts: 12,
          shouldContinue: () => canEnableReconnectedSimulator(
            reconnectPayload,
            simulatorProjectRevision,
            hardwareContract.fingerprint,
            simulatorSetupActive,
          ),
          update: setLogMessage,
        }))
        .then((deviceUrl) => {
          if (canEnableReconnectedSimulator(
            reconnectPayload,
            simulatorProjectRevision,
            hardwareContract.fingerprint,
            simulatorSetupActive,
          )) {
            enableSimulatorLink(deviceUrl, true);
          }
        })
        .catch((error) => {
          if (canEnableReconnectedSimulator(
            reconnectPayload,
            simulatorProjectRevision,
            hardwareContract.fingerprint,
            simulatorSetupActive,
          )) {
            setLogMessage(
              `Automatic ESP32 reconnect stopped: ${error instanceof Error ? error.message : String(error)}`,
              true,
            );
          }
        })
        .finally(() => {
          simulatorReconnectRequest = undefined;
          if (requestedRevision !== simulatorProjectRevision) {
            tryReconnectSimulatorLink();
          }
        });
    };

    createEsp32SetupController({
      dialog: esp32SetupDialog,
      openButton: openEsp32SetupButton,
      runButton: runEsp32SetupButton,
      closeButton: closeEsp32SetupButton,
      ssidInput: esp32WifiSsidInput,
      passwordInput: esp32WifiPasswordInput,
      firmwareInput: esp32FirmwareInput,
      progressElement: esp32SetupProgress,
      progressLabel: esp32SetupProgressLabel,
      bootInstruction: esp32BootInstruction,
      clearSetupLog: () => esp32SetupConsole.replaceChildren(),
      setLogMessage,
      getPayload: setupPayload,
      onSetupActiveChange: async (active) => {
        simulatorSetupActive = active;
        updatePhysicalRouteReviewAvailability();
        if (!active) return;
        simulatorDeviceUrl = undefined;
        simulatorLinkFailed = false;
        updatePhysicalRouteReviewAvailability();
        if (standaloneSaveTimer) {
          clearTimeout(standaloneSaveTimer);
          standaloneSaveTimer = undefined;
        }
        setLogMessage("Live preview paused while standalone playback is verified.");
        await settleSimulatorDeviceWork([
          simulatorReconnectRequest,
          standaloneSaveRequest,
          simulatorFrameRequest,
        ]);
      },
      onSetupComplete: (deviceUrl, payload) => {
        if (!isCurrentSimulatorSetup(
          payload,
          simulatorProjectRevision,
          hardwareContract.fingerprint,
        )) {
          setLogMessage(
            "ESP32 setup completed for an older project. Load the current project into the ESP32 before preview.",
            true,
          );
          return;
        }
        enableSimulatorLink(deviceUrl);
      },
    });
    void automaticEsp32ReconnectAvailable(
      reconnectStorage(),
      navigator.serial,
    ).then((available) => {
      simulatorReconnectEnabled = retainAutomaticReconnectEligibility(
        simulatorReconnectEnabled,
        available,
      );
      if (available) tryReconnectSimulatorLink();
    });

    const replacePortableBundle = (
      bundle?: PortableProjectBundle,
    ): void => {
      activePortableBundle?.dispose();
      generatedMemoryUrls.forEach((url) => URL.revokeObjectURL(url));
      generatedMemoryUrls = new Map();
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
        editorDefinition, activePlacementSurface !== undefined,
        pipelineAvailable, editorProject.panelProfile,
      );
      renderer?.setEditorCapabilities(capabilities);
      const packageIsCurrent = verifiedGeneratedMechanics !== undefined;
      assemblyPackageButton.textContent = packageIsCurrent
        ? "Download panel closures package"
        : "Generate panel closures";
      assemblyPackageButton.disabled = mapping.topology !== "panelized-sculpture" ||
        (!packageIsCurrent && !capabilities.canGenerateGenericMechanics);
      assemblyPackageButton.title = packageIsCurrent
        ? "Download the current project, verified geometry, manual, and guarded deployment export."
        : capabilities.canGenerateGenericMechanics
          ? "Build current boundary and part STLs. The button changes to Download when they are verified."
          : "Panel closure generation currently supports only rigid rectangular panel carriers.";
      downloadMadMapperPackageButton.disabled =
        !hardwareContract.readiness.mappingReady;
      downloadMadMapperPackageButton.title = hardwareContract.readiness.mappingReady
        ? "Download the MadMapper SVG, patch information, manifest, and setup PDF."
        : "Confirm the authored route and panel addressing before MadMapper export.";
      downloadPanelLabelsButton.disabled = editorDefinition.panels.length === 0;
      downloadPanelLabelsButton.title = editorDefinition.panels.length === 0
        ? "Place at least one panel before downloading fabrication files."
        : "Download panel labels, the manufacturing manual, and all current verified printable files.";
      madMapperPreviewButton.disabled = !hardwareContract.readiness.mappingReady;
      madMapperPreviewButton.title = hardwareContract.readiness.mappingReady
        ? "Receive the generated physical Art-Net patch on loopback and show it on the 3D sculpture."
        : "Confirm the authored route and panel addressing before MadMapper preview.";
      generateStructureButton.disabled =
        !capabilities.canGenerateStructuralMechanics;
      generateSurfaceStructureButton.disabled = generateStructureButton.disabled;
      generateStructureButton.title = capabilities.canGenerateStructuralMechanics
        ? "Generate nearest-hole connector ribbons, STL, 3MF, and an optional load-path report."
        : "Connector generation currently supports only rigid rectangular panel carriers.";
      generateSurfaceStructureButton.title = capabilities.canGenerateStructuralMechanics
        ? "Generate 2 mm full-edge bridges at the panel LED planes, STL, 3MF, and an optional load-path report."
        : "Bridge generation currently supports only rigid rectangular panel carriers.";
      automaticPanelPlacementControls.hidden = false;
      automaticallyPlacePanelsButton.disabled =
        !capabilities.canAutomaticallySeed;
      automaticallyPlacePanelsButton.title = activePlacementSurface
          ? capabilities.canAutomaticallySeed
            ? "Seed panels evenly across the active placement surface."
            : "Automatic placement currently supports only rigid rectangular panel carriers."
          : "Load a GLB or sculpture JSON shell first.";
    };

    const selectedAssemblyTutorialChain = (): AssemblyTutorialChain | null => {
      return assemblyTutorialModel.chains[assemblyTutorialChainIndex] ?? null;
    };

    const syncAssemblyTutorialOutputControls = (): void => {
      const selectedOutputIndex = selectedAssemblyTutorialChain()?.outputIndex;
      for (const output of wiringPreview.outputs) {
        renderer?.setOutputVisible(
          output.outputIndex,
          output.outputIndex === selectedOutputIndex,
        );
      }
    };

    const applyAssemblyTutorialView = (): void => {
      const chain = selectedAssemblyTutorialChain();
      if (!assemblyTutorialActive || !chain || chain.panels.length === 0) {
        renderer?.setAssemblyTutorial(null);
        return;
      }
      renderer?.setAssemblyTutorial(
        chain,
        assemblyTutorialConnectionIndex,
        assemblyTutorialPanelIndex,
      );
      assemblyTutorialWarning.textContent = chain.routeWarning;
      assemblyTutorialWarning.dataset.status = chain.routeStatus;
      const connectionIndex = assemblyTutorialConnectionIndex ?? 0;
      const panelIndex = assemblyTutorialPanelIndex;
      const panel = panelIndex === null ? null : chain.panels[panelIndex] ?? null;
      if (panel) {
        const cableInstructions = panel.connectionIndices
          .map((index) => chain.connections[index]?.instruction)
          .filter((instruction): instruction is string => instruction !== undefined);
        assemblyTutorialStep.value =
          `${chain.label} · panel ${panel.chainPosition + 1} / ${chain.panels.length}`;
        assemblyTutorialInstruction.textContent =
          `${panel.label}: solder ${cableInstructions.join("; ")}. ` +
          "If a printable part is highlighted, fit it before the contacts become difficult to reach.";
      } else {
        const connection = chain.connections[connectionIndex];
        assemblyTutorialStep.value =
          `${chain.label} · wire ${connectionIndex + 1} / ${chain.connections.length}`;
        assemblyTutorialInstruction.textContent = connection?.instruction ??
          "This connection is unavailable.";
      }
      assemblyTutorialPreviousChainButton.disabled = assemblyTutorialChainIndex === 0;
      assemblyTutorialNextChainButton.disabled =
        assemblyTutorialChainIndex === assemblyTutorialModel.chains.length - 1;
      assemblyTutorialNextWireButton.disabled =
        assemblyTutorialChainIndex === assemblyTutorialModel.chains.length - 1 &&
        connectionIndex === chain.connections.length - 1;
      assemblyTutorialPreviousWireButton.disabled =
        assemblyTutorialChainIndex === 0 && connectionIndex === 0;
      assemblyTutorialNextPanelButton.disabled =
        assemblyTutorialChainIndex === assemblyTutorialModel.chains.length - 1 &&
        (panelIndex ?? connectionIndex) === chain.panels.length - 1;
      assemblyTutorialPreviousPanelButton.disabled =
        assemblyTutorialChainIndex === 0 && (panelIndex ?? connectionIndex) === 0;
    };

    const exitAssemblyTutorial = (announce = true): void => {
      if (!assemblyTutorialActive) return;
      assemblyTutorialActive = false;
      assemblyTutorialChainIndex = 0;
      assemblyTutorialConnectionIndex = null;
      assemblyTutorialPanelIndex = null;
      renderer?.setAssemblyTutorial(null);
      if (assemblyTutorialOutputVisibility) {
        for (const output of wiringPreview.outputs) {
          const visible = assemblyTutorialOutputVisibility.get(
            output.outputIndex,
          ) ?? true;
          outputLayerVisibility.set(output.outputIndex, visible);
          renderer?.setOutputVisible(output.outputIndex, visible);
        }
      }
      assemblyTutorialOutputVisibility = null;
      assemblyTutorialStartButton.hidden = false;
      assemblyTutorialControls.hidden = true;
      renderAssemblyTutorialControls();
      if (announce) setLogMessage("Exited the data-chain assembly tutorial.");
    };

    const renderAssemblyTutorialControls = (): void => {
      assemblyTutorialModel = createAssemblyTutorialModel(wiringPreview);
      assemblyTutorialChainIndex = Math.min(
        assemblyTutorialChainIndex,
        Math.max(0, assemblyTutorialModel.chains.length - 1),
      );
      const chain = selectedAssemblyTutorialChain();
      const available = chain !== null && chain.panels.length > 0;
      if (chain) {
        if (assemblyTutorialPanelIndex !== null) {
          assemblyTutorialPanelIndex = Math.min(
            assemblyTutorialPanelIndex,
            chain.panels.length - 1,
          );
        }
        if (assemblyTutorialConnectionIndex !== null) {
          assemblyTutorialConnectionIndex = Math.min(
            assemblyTutorialConnectionIndex,
            chain.connections.length - 1,
          );
        }
      }
      assemblyTutorialStartButton.disabled = !available;
      if (!chain) {
        assemblyTutorialWarning.textContent = "No data chain is available.";
        assemblyTutorialWarning.dataset.status = "unavailable";
        assemblyTutorialInstruction.textContent =
          "Load a Schema 2 project with at least one panelized output.";
        if (assemblyTutorialActive) exitAssemblyTutorial(false);
        return;
      }
      assemblyTutorialWarning.textContent = chain.routeWarning;
      assemblyTutorialWarning.dataset.status = chain.routeStatus;
      if (!assemblyTutorialActive) {
        assemblyTutorialInstruction.textContent =
          `Isolate ${assemblyTutorialModel.chains.length} data ${
            assemblyTutorialModel.chains.length === 1 ? "chain" : "chains"
          } and step through every panel or cable.`;
      } else {
        applyAssemblyTutorialView();
      }
    };

    const renderRouteEditor = (): void => {
      const isPanelized = mapping.topology === "panelized-sculpture";
      routeEditorSection.hidden = !isPanelized;
      optimizeWiringButton.hidden = !isPanelized;
      optimizeWiringButton.disabled = !isPanelized || editorDefinition.panels.length === 0 ||
        wiringPreview.status === "measured" || wiringPreview.status === "hardware-verified";
      const orientationPolicy = automaticWiringOrientationPolicy(editorDefinition);
      const manualRotationGate =
        editorDefinition.wiring.panelRotationConstraint === "half-turns-only";
      toggleWiringRotationGateButton.hidden = !isPanelized;
      toggleWiringRotationGateButton.disabled = !isPanelized;
      toggleWiringRotationGateButton.setAttribute(
        "aria-pressed",
        String(manualRotationGate),
      );
      toggleWiringRotationGateButton.textContent = manualRotationGate
        ? "Remove manual 0/180° rotation gate"
        : "Use current poses + 0/180° gate";
      wiringOptimizationSummary.textContent = isPanelized
        ? `${wiringPreview.outputs.length} output${wiringPreview.outputs.length === 1 ? "" : "s"} · ${editorDefinition.panels.length} panels · GPIO ${wiringPreview.outputs.map((output) => output.gpio ?? "unassigned").join("/")} · ${orientationPolicy === "half-turns-only" ? `${manualRotationGate ? "manual " : "fabrication "}0/180° orientation gate` : "0/90/180/270° before fabrication"}.`
        : "Automatic wiring requires a panelized Schema 2 project.";
      if (!isPanelized || !routeEditorModel) {
        routeEditor.replaceChildren();
        routeEditorNote.textContent = "A panelized sculpture is required for route editing.";
        routeActionButton.hidden = true;
        routeActionButton.disabled = true;
        setLogMessage("No panel route is available.");
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
            ? "This is the saved measured route. Regenerating mapping/wiring removes the old measurement approval."
            : editorDefinition.wiring.routeRevision === undefined
              ? "This saved route has no revision. Review it, then regenerate mapping/wiring."
              : wiringPreview.status === "requires-review"
                ? "This saved route requires review. Regenerate mapping/wiring only after its order matches the sculpture."
                : "This is the saved authored route. Edit it, then regenerate mapping/wiring as a new revision.";
      routeEditorNote.textContent = sourceLabel;
      routeActionButton.hidden = false;
      routeActionButton.textContent = isDraftSuggestion
        ? "Edit suggested route"
        : "Regenerate mapping/wiring";
      routeActionButton.disabled = !isDraftSuggestion && !validation.valid;
      setLogMessage(validation.valid
        ? isDraftSuggestion
          ? "Review the suggestion, then choose Edit suggested route."
          : `Route is complete. Regenerate mapping/wiring as revision ${(editorDefinition.wiring.routeRevision ?? 0) + 1}.`
        : validation.errors[0]!, !validation.valid);

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

    const renderControllerPositionControls = (): void => {
      const layout = createWiringControllerLayout(wiringPreview);
      const authoredPosition = editorDefinition.wiring.controller.position;
      resetControllerPositionButton.disabled = authoredPosition === undefined;
      controllerPositionStatus.textContent = layout === null
        ? "No controller is available for this project."
        : authoredPosition
        ? "Click the controller to edit its saved 6DOF pose."
        : "Click the suggested controller to place and rotate it.";
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
      if (!allValid) {
        setLogMessage(
          validation.errors[0] ?? wiringValidation.errors[0] ??
            ledmapErrors[0] ?? "Invalid mapping",
          true,
        );
      }
      panelLabelsToggle.disabled = !isPanelized;
      const hasPrintableClosures =
        isPanelized && (verifiedGeneratedMechanics !== undefined ||
          verifiedGeneratedStructure !== undefined ||
          (mechanicalShellIsCurrent() &&
            (mapping.printableClosures?.length ?? 0) > 0));
      printableLayerToggle.disabled = !hasPrintableClosures;
      connectorLayerToggle.disabled = !isPanelized;
      wiringLayerToggle.disabled = !isPanelized;
      wiringLayerControls.classList.toggle(
        "layer-controls--disabled",
        !isPanelized,
      );
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
      renderControllerPositionControls();
      updatePipelineAvailability();
    };

    const restoreGeneratedMechanics = async (
      selected: LoadedSculpture,
    ): Promise<void> => {
      const revision = ++generatedAssetLoadRevision;
      verifiedGeneratedMechanics = undefined;
      verifiedGeneratedStructure = undefined;
      renderer?.setExactGeneratedMechanics(null);
      renderer?.setExactGeneratedStructure();
      const structuralState = getGeneratedStructuralState(
        selected.definition,
        selected.project.panelProfile,
      );
      if (structuralState === "stale") {
        updateMappingStatus();
        return;
      }
      if (structuralState === "current") {
        try {
          const assets = await loadVerifiedGeneratedStructure(
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
          for (const artifact of assets.artifacts) {
            rememberProjectAsset(artifact.source, artifact.bytes);
          }
          renderer?.setExactGeneratedStructure(assets);
          verifiedGeneratedStructure = assets;
          updateMappingStatus();
          return;
        } catch (error) {
          if (revision !== generatedAssetLoadRevision) return;
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
          updateMappingStatus();
          return;
        }
      }
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
        setLogMessage(message, true);
        updateMappingStatus();
      }
    };

    const renderEditorFaces = (): void => {
      const options = supportsRectangularPanelTools(editorProject.panelProfile) &&
          mechanicalShellIsCurrent() && editorDefinition.closures
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
      if (artNetPreviewClient.active) {
        stopMadMapperPreview("MadMapper preview stopped because the project changed.");
      }
      exitAssemblyTutorial(false);
      simulatorProjectRevision += 1;
      simulatorLedmapUpdateAuthorized =
        selectedHardwareContract.fingerprint !== selected.contract.fingerprint &&
        physicalAddressContractKey(selectedHardwareContract) ===
          physicalAddressContractKey(selected.contract);
      simulatorDeviceUrl = undefined;
      simulatorLinkFailed = false;
      updatePhysicalRouteReviewAvailability();
      if (standaloneSaveTimer) {
        clearTimeout(standaloneSaveTimer);
        standaloneSaveTimer = undefined;
      }
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
      tryReconnectSimulatorLink();
      ledCountInput.value = String(mapping.entries.length);
      renderer?.setPanelProfile(selected.project.panelProfile);
      renderer?.setMapping(mapping);
      renderer?.setWiringPreview(wiringPreview);
      renderAssemblyTutorialControls();
      renderRouteEditor();
      resetTimeline();
      updateMappingStatus();
      renderConnectorControls();
      return restoreGeneratedMechanics(selected);
    };

    resetControllerPositionButton.addEventListener("click", () => {
      const nextDefinition = useSuggestedControllerPose(editorDefinition);
      const project = createPanelAssemblyProject(
        nextDefinition,
        editorProject.source,
        editorProject.panelProfile,
      );
      void applyLoadedSculpture(createLoadedSculpture(project)).then(() => {
        setLogMessage("The controller uses the suggested position.");
      }).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    });

    const connectorPairKey = (left: string, right: string): string =>
      [left, right].sort().join("\u0000");

    const resolvedConnectorization = (): StructuralConnectorizationDefinition => ({
      ...structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS),
      ...structuredClone(editorDefinition.structuralDesign?.connectorization ?? {}),
      panelPairOverrides: structuredClone(
        editorDefinition.structuralDesign?.connectorization?.panelPairOverrides ?? [],
      ),
    });

    const applyConnectorization = async (
      connectorization: StructuralConnectorizationDefinition,
    ): Promise<void> => {
      const nextDefinition = structuredClone(editorDefinition);
      nextDefinition.structuralDesign ??= structuredClone(STRUCTURAL_PREVIEW_DEFAULTS);
      nextDefinition.structuralDesign.connectorization = connectorization;
      const project = createPanelAssemblyProject(
        nextDefinition,
        editorProject.source,
        editorProject.panelProfile,
      );
      await applyLoadedSculpture(createLoadedSculpture(project));
      renderConnectorControls();
      setLogMessage(
        "Modular connector settings changed. Generate connector ribbons to refresh printable parts.",
      );
    };

    const renderConnectorControls = (): void => {
      connectorSettings.hidden = editorDefinition.panels.length === 0;
      const settings = resolvedConnectorization();
      connectorNeighborDistanceInput.value = String(settings.maximumNeighborDistanceMm);
      connectorNeighborDegreeInput.value = String(settings.maximumAutomaticNeighborsPerPanel);
      connectorBedInputs.forEach((input, axis) => {
        input.value = String(settings.printBedSizeMm[axis]);
      });
      connectorSegmentLengthInput.value = String(settings.maximumStrutSegmentLengthMm);
      const panelIds = editorDefinition.panels.map(({ id }) => id).sort();
      const options = panelIds.map((id) => new Option(id, id));
      connectorPairFirstSelect.replaceChildren(...options.map((option) => option.cloneNode(true)));
      connectorPairSecondSelect.replaceChildren(...options.map((option) => option.cloneNode(true)));
      if (panelIds.length > 1) connectorPairSecondSelect.value = panelIds[1]!;
      includeConnectorPairButton.disabled = panelIds.length < 2;
      try {
        const normalized = normalizeStructuralDesign(editorProject);
        const candidate = createCandidateTruss(normalized);
        const rows = candidate.connectorCells.map((cell) => ({
          panelIds: cell.panelIds,
          checked: true,
          detail: `${cell.panelDistanceMm.toFixed(1)} mm; ${cell.source === "automatic" ? "automatic" : "included"}`,
        }));
        for (const override of settings.panelPairOverrides.filter(
          ({ action }) => action === "exclude",
        )) {
          if (!rows.some(({ panelIds: ids }) =>
            connectorPairKey(...ids) === connectorPairKey(...override.panelIds)
          )) rows.push({
            panelIds: override.panelIds,
            checked: false,
            detail: "excluded",
          });
        }
        rows.sort((left, right) =>
          connectorPairKey(...left.panelIds).localeCompare(connectorPairKey(...right.panelIds))
        );
        connectorPairList.replaceChildren(...rows.map((row) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = row.checked;
          input.addEventListener("change", () => {
            const next = resolvedConnectorization();
            const key = connectorPairKey(...row.panelIds);
            next.panelPairOverrides = next.panelPairOverrides.filter(
              ({ panelIds: ids }) => connectorPairKey(...ids) !== key,
            );
            next.panelPairOverrides.push({
              panelIds: [...row.panelIds],
              action: input.checked ? "include" : "exclude",
            });
            void applyConnectorization(next).catch((error) => {
              setLogMessage(error instanceof Error ? error.message : String(error), true);
            });
          });
          label.append(input, `${row.panelIds[0]} ↔ ${row.panelIds[1]} (${row.detail})`);
          return label;
        }));
      } catch (error) {
        const message = document.createElement("span");
        message.textContent = error instanceof Error ? error.message : String(error);
        connectorPairList.replaceChildren(message);
      }
    };

    const applyConnectorInputs = (): void => {
      const next = resolvedConnectorization();
      next.maximumNeighborDistanceMm = Number(connectorNeighborDistanceInput.value);
      next.maximumAutomaticNeighborsPerPanel = Number(connectorNeighborDegreeInput.value);
      next.printBedSizeMm = connectorBedInputs.map((input) => Number(input.value)) as [number, number, number];
      next.maximumStrutSegmentLengthMm = Number(connectorSegmentLengthInput.value);
      void applyConnectorization(next).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    };
    for (const input of [
      connectorNeighborDistanceInput,
      connectorNeighborDegreeInput,
      ...connectorBedInputs,
      connectorSegmentLengthInput,
    ]) input.addEventListener("change", applyConnectorInputs);
    includeConnectorPairButton.addEventListener("click", () => {
      const first = connectorPairFirstSelect.value;
      const second = connectorPairSecondSelect.value;
      if (!first || !second || first === second) {
        setLogMessage("Select two different panels for a connector.", true);
        return;
      }
      const next = resolvedConnectorization();
      const key = connectorPairKey(first, second);
      next.panelPairOverrides = next.panelPairOverrides.filter(
        ({ panelIds }) => connectorPairKey(...panelIds) !== key,
      );
      next.panelPairOverrides.push({ panelIds: [first, second].sort() as [string, string], action: "include" });
      void applyConnectorization(next).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    });

    const clearDesignSurface = (message: string): void => {
      activePlacementSurface = undefined;
      automaticallyPlacePanelsButton.disabled = true;
      renderer?.setDesignSurface(null);
      setLogMessage(message);
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
      const size = surface.validation.bounds.size
        .map((value) => Math.round(value))
        .join(" × ");
      setLogMessage(
        source +
        ": " +
        surface.validation.triangleCount.toLocaleString() +
        " triangles, " +
        size +
        " mm, watertight.",
      );
    };

    const showMechanicalShellSurface = (message?: string): void => {
      if (!editorDefinition.mechanicalShell) {
        throw new Error("This project has no JSON mechanical-shell placement surface.");
      }
      const surface = loadMechanicalShellDesignSurface(editorDefinition);
      showDesignSurface(surface, "sculpture JSON face graph", "mechanical-shell");
      if (message) setLogMessage(message);
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

    const currentPanelTransformMode = (): "surface" | "free-3d" =>
      panelTransformMode.dataset.mode === "free-3d" ? "free-3d" : "surface";
    const synchronizePanelTransformToggle = (): void => {
      const mode = currentPanelTransformMode();
      const free3d = mode === "free-3d";
      panelTransformMode.setAttribute("aria-pressed", String(free3d));
      panelTransformMode.setAttribute(
        "aria-label",
        free3d
          ? "Panel transform: free 6DOF world mode"
          : "Panel transform: move along surface",
      );
      panelTransformMode.title = free3d
        ? "Free 6DOF world transform"
        : "Move along surface";
    };
    const applyPanelTransformMode = (): void => {
      const mode = currentPanelTransformMode();
      const free3d = mode === "free-3d";
      synchronizePanelTransformToggle();
      renderer?.setPanelTransformMode(mode);
      setLogMessage(free3d
        ? "Free 6DOF panel transforms are active. A completed move detaches that panel from its placement surface."
        : "Surface move mode is active. Panels stay on the active surface, or move in their saved local plane when no surface is loaded.");
    };
    panelTransformMode.addEventListener("click", () => {
      panelTransformMode.dataset.mode = currentPanelTransformMode() === "surface"
        ? "free-3d"
        : "surface";
      applyPanelTransformMode();
    });
    synchronizePanelTransformToggle();
    renderer?.setPanelTransformMode("surface");

    renderer?.setSurfaceEditorCallbacks({
      onSelectionChange: (panelId) => {
        if (physicalRouteReviewSession) {
          if (
            physicalRouteReviewProgrammaticSelection ||
            physicalRouteReviewApplying ||
            panelId === null
          ) return;
          try {
            const currentSlotIndex = physicalRouteReviewSession.currentSlotIndex;
            const changesIdentity =
              physicalRouteReviewSession.slots[currentSlotIndex]?.panelId !== panelId;
            physicalRouteReviewSession = assignPhysicalRouteReviewPanel(
              physicalRouteReviewSession,
              currentSlotIndex,
              panelId,
              !changesIdentity,
            );
            const nextAction = changesIdentity
              ? showPhysicalRouteReviewSlot(currentSlotIndex, false)
              : advancePhysicalRouteReview();
            void nextAction.catch((error) => {
              setLogMessage(
                error instanceof Error ? error.message : String(error),
                true,
              );
            });
          } catch (error) {
            setLogMessage(error instanceof Error ? error.message : String(error), true);
          }
          return;
        }
        selectedEditorPanelId = panelId;
        for (const row of routeEditor.querySelectorAll<HTMLElement>(".route-panel")) {
          row.classList.toggle(
            "route-panel--selected",
            row.dataset.panelId === panelId,
          );
        }
        const capabilities = deriveEditorCapabilities(
          editorDefinition, activePlacementSurface !== undefined,
          pipelineAvailable, editorProject.panelProfile,
        );
        if (panelId) {
          const free3d = currentPanelTransformMode() === "free-3d";
          const actions = [
            capabilities.canTranslateOnActiveSurface || capabilities.canTranslateInPanelPlane
              ? free3d ? "move on local X/Y/Z" : "move along the surface"
              : "",
            capabilities.canRotateSelectedPanel
              ? free3d ? "rotate on local X/Y/Z" : "rotate around local Z"
              : "",
            capabilities.canDeleteSelectedPanel ? "delete" : "",
          ].filter(Boolean);
          setLogMessage(
            "Selected " + panelId + ". Available: " + actions.join(", ") + ".",
          );
        }
      },
      onControllerSelectionChange: (selected) => {
        if (!selected) return;
        selectedEditorPanelId = null;
        for (const row of routeEditor.querySelectorAll<HTMLElement>(".route-panel")) {
          row.classList.remove("route-panel--selected");
        }
        setLogMessage(
          "Selected controller. Available: move on local X/Y/Z, rotate on local X/Y/Z.",
        );
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
          setLogMessage(edited.mechanicalShell
              ? "Moved " + placement.panelId + ". Pose is saved; 3D generation will validate it against the JSON boundary and regenerate printable mechanics."
              : "Moved " + placement.panelId + ". Mapping and wiring refreshed; no printable mechanics exist yet.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
          setLogMessage(edited.mechanicalShell
              ? "Moved " + panelId + " in its saved panel plane. Mapping and wiring refreshed; generated mechanics require regeneration."
              : "Moved " + panelId + " in its saved panel plane. Mapping and wiring refreshed; no printable mechanics exist yet.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
          setLogMessage(edited.mechanicalShell
              ? "Rotated " + panelId + " " + Math.abs(degrees).toFixed(1) + "° " + direction + " as viewed from outside. 3D generation will revalidate its full PCB envelope."
              : "Rotated " + panelId + " " + Math.abs(degrees).toFixed(1) + "° " + direction + " as viewed from outside. Mapping and wiring refreshed; no printable mechanics exist yet.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
        }
      },
      onFreeTransformCommit: (transform) => {
        try {
          const edited = setPanelWorldPose(
            editorDefinition,
            transform.panelId,
            transform,
          );
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          applyLoadedSculpture(createLoadedSculpture(project));
          renderer?.selectEditorPanel(transform.panelId);
          setLogMessage(edited.mechanicalShell
            ? `Transformed ${transform.panelId} freely in 3D. Its surface attachment was removed and generated mechanics require regeneration.`
            : `Transformed ${transform.panelId} freely in 3D. Mapping and wiring refreshed; no printable mechanics exist yet.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
        }
      },
      onControllerTransformCommit: (transform) => {
        try {
          const edited = setControllerWorldPose(editorDefinition, transform);
          const project = createPanelAssemblyProject(
            edited,
            editorProject.source,
            editorProject.panelProfile,
          );
          void applyLoadedSculpture(createLoadedSculpture(project)).then(() => {
            renderer?.selectEditorController();
            setLogMessage(
              "Saved the controller position and orientation. Wiring geometry refreshed.",
            );
          }).catch((error) => {
            setLogMessage(
              error instanceof Error ? error.message : String(error),
              true,
            );
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
          setLogMessage(editorDefinition.mechanicalShell
            ? `Added ${panelId} on canvas triangle ${placement.attachment.triangleIndex}. 3D generation will regenerate from the JSON mechanical boundary.`
            : `Added ${panelId} on canvas triangle ${placement.attachment.triangleIndex}. Mapping and wiring refreshed; no printable mechanics exist yet.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
          setLogMessage(edited.mechanicalShell
              ? "Deleted " + panelId + ". 3D generation will regenerate the closed JSON mechanical boundary."
              : "Deleted " + panelId + ". Mapping and wiring refreshed; no printable mechanics exist yet.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
        }
      },
    });

    openPhysicalRouteReviewButton.addEventListener("click", () => {
      const demo = simulatorDeviceUrl === undefined;
      void beginPhysicalRouteReview(demo).catch(async (error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
        await closePhysicalRouteReview(!demo);
      });
    });
    physicalRouteReviewPreviousButton.addEventListener("click", () => {
      const session = physicalRouteReviewSession;
      if (!session || physicalRouteReviewApplying || session.currentSlotIndex <= 0) return;
      void showPhysicalRouteReviewSlot(session.currentSlotIndex - 1).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    });
    physicalRouteReviewSummaryBackButton.addEventListener("click", () => {
      const session = physicalRouteReviewSession;
      if (!session || physicalRouteReviewApplying || session.slots.length === 0) return;
      void showPhysicalRouteReviewSlot(session.slots.length - 1).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    });
    physicalRouteReviewConfirmButton.addEventListener("click", () => {
      if (!physicalRouteReviewSession || physicalRouteReviewApplying) return;
      physicalRouteReviewSession = confirmPhysicalRouteReviewSlot(
        physicalRouteReviewSession,
        physicalRouteReviewSession.currentSlotIndex,
      );
      void advancePhysicalRouteReview().catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
    });
    const rotatePhysicalRouteReview = (delta: -1 | 1): void => {
      if (!physicalRouteReviewSession || physicalRouteReviewApplying) return;
      physicalRouteReviewSession = rotatePhysicalRouteReviewPanel(
        physicalRouteReviewSession,
        physicalRouteReviewSession.currentSlotIndex,
        delta,
      );
      void showPhysicalRouteReviewSlot(
        physicalRouteReviewSession.currentSlotIndex,
        false,
      );
    };
    physicalRouteReviewRotateLeftButton.addEventListener("click", () =>
      rotatePhysicalRouteReview(-1)
    );
    physicalRouteReviewRotateRightButton.addEventListener("click", () =>
      rotatePhysicalRouteReview(1)
    );
    physicalRouteReviewCancelButton.addEventListener("click", () => {
      void closePhysicalRouteReview(true).then(() => {
        setLogMessage("Physical wiring review cancelled. No project data changed.");
      });
    });
    physicalRouteReviewDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (physicalRouteReviewApplying) return;
      void closePhysicalRouteReview(true).then(() => {
        setLogMessage("Physical wiring review cancelled. No project data changed.");
      });
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key !== "Escape" ||
        !physicalRouteReviewSession ||
        physicalRouteReviewApplying
      ) return;
      event.preventDefault();
      void closePhysicalRouteReview(true).then(() => {
        setLogMessage("Physical wiring review cancelled. No project data changed.");
      });
    });
    physicalRouteReviewApplyButton.addEventListener("click", () => {
      if (physicalRouteReviewDemo) return;
      void (async () => {
        const session = physicalRouteReviewSession;
        const deviceUrl = physicalRouteReviewDeviceUrl;
        if (!session || !deviceUrl) {
          throw new Error("The physical wiring review is no longer active.");
        }
        physicalRouteReviewApplying = true;
        setPhysicalRouteReviewBusy(true);
        physicalRouteReviewApplyButton.disabled = true;
        physicalRouteReviewCancelButton.disabled = true;
        const pending = physicalRouteReviewPendingApply ?? (() => {
          const reviewedDefinition = applyPhysicalRouteReview(editorDefinition, session);
          const reviewedProject = createPanelAssemblyProject(
            reviewedDefinition,
            editorProject.source,
            editorProject.panelProfile,
          );
          return {
            session,
            deviceUrl,
            reviewedSculpture: createLoadedSculpture(reviewedProject),
          };
        })();
        physicalRouteReviewPendingApply = pending;
        await physicalRouteReviewFrameRequest?.catch(() => undefined);
        await synchronizeDeviceLedmap(
          pending.deviceUrl,
          `${JSON.stringify(pending.reviewedSculpture.contract.ledmap)}\n`,
          true,
          () =>
            physicalRouteReviewSession === pending.session && physicalRouteReviewApplying,
          setLogMessage,
        );
        await applyLoadedSculpture(pending.reviewedSculpture);
        physicalRouteReviewSession = undefined;
        physicalRouteReviewDeviceUrl = undefined;
        physicalRouteReviewApplying = false;
        physicalRouteReviewPendingApply = undefined;
        appRoot.classList.remove("app--physical-route-review");
        controlPanel.inert = false;
        selectPhysicalRouteReviewPanel(null);
        physicalRouteReviewOriginalSelection = null;
        physicalRouteReviewDialog.close();
        physicalRouteReviewApplyButton.disabled = false;
        physicalRouteReviewCancelButton.disabled = false;
        physicalRouteReviewApplyButton.textContent = "Apply and regenerate mapping";
        enableSimulatorLink(pending.deviceUrl, true);
        setLogMessage(
          "Physical panel order and address orientation were saved. The exact ESP32 ledmap was regenerated, activated, and read back.",
        );
      })().catch((error) => {
        physicalRouteReviewApplyButton.disabled = false;
        physicalRouteReviewApplyButton.textContent = "Retry exact ESP32 verification";
        physicalRouteReviewCancelButton.disabled = true;
        physicalRouteReviewSummaryNote.textContent =
          "The ESP32 update is not yet verified. The old project cannot resume because the device might already use the reviewed map. Retry until exact activation and read-back succeed.";
        setLogMessage(
          `Physical wiring apply is frozen until exact ESP32 verification succeeds: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      });
    });

    effectSelect.addEventListener("change", () => {
      engine.setEffect(Number(effectSelect.value));
      resetTimeline();
      scheduleStandaloneSave();
    });
    const cycleSelect = (select: HTMLSelectElement, direction: -1 | 1): void => {
      const optionCount = select.options.length;
      if (optionCount === 0) return;
      select.selectedIndex = (select.selectedIndex + direction + optionCount) % optionCount;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    previousEffectButton.addEventListener("click", () => cycleSelect(effectSelect, -1));
    nextEffectButton.addEventListener("click", () => cycleSelect(effectSelect, 1));
    paletteSelect.addEventListener("change", () => {
      engine.setPalette(Number(paletteSelect.value));
      scheduleStandaloneSave();
    });
    previousPaletteButton.addEventListener("click", () => cycleSelect(paletteSelect, -1));
    nextPaletteButton.addEventListener("click", () => cycleSelect(paletteSelect, 1));
    speedInput.addEventListener("input", () => {
      speedValue.value = speedInput.value;
      engine.setSpeed(Number(speedInput.value));
      scheduleStandaloneSave();
    });
    intensityInput.addEventListener("input", () => {
      intensityValue.value = intensityInput.value;
      engine.setIntensity(Number(intensityInput.value));
      scheduleStandaloneSave();
    });
    displayMode.addEventListener("change", () => {
      currentDisplayMode = displayMode.value as DisplayMode;
    });
    panelLabelsToggle.addEventListener("change", () => {
      renderer?.setPanelLabelsVisible(
        mapping.topology === "panelized-sculpture" && panelLabelsToggle.checked,
      );
    });
    assemblyTutorialStartButton.addEventListener("click", () => {
      assemblyTutorialChainIndex = 0;
      const chain = selectedAssemblyTutorialChain();
      if (!chain || chain.panels.length === 0) {
        setLogMessage("No data chain is available for the assembly tutorial.", true);
        return;
      }
      assemblyTutorialActive = true;
      assemblyTutorialOutputVisibility = new Map(
        wiringPreview.outputs.map((output) => [
          output.outputIndex,
          outputLayerVisibility.get(output.outputIndex) ?? true,
        ]),
      );
      assemblyTutorialConnectionIndex = 0;
      assemblyTutorialPanelIndex = 0;
      assemblyTutorialStartButton.hidden = true;
      assemblyTutorialControls.hidden = false;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
      setLogMessage(
        `Isolated ${chain.label}: ${chain.panels.length} panels. Panel mode shows solder cables and current printable attachments.`,
      );
    });
    assemblyTutorialPreviousChainButton.addEventListener("click", () => {
      const previous = previousAssemblyTutorialChain(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        connectionIndex: assemblyTutorialConnectionIndex,
      });
      assemblyTutorialChainIndex = previous.chainIndex;
      assemblyTutorialConnectionIndex = previous.connectionIndex;
      assemblyTutorialPanelIndex = assemblyTutorialPanelIndex === null
        ? null
        : assemblyTutorialModel.chains[previous.chainIndex]!.panels.length - 1;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialNextChainButton.addEventListener("click", () => {
      const next = nextAssemblyTutorialChain(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        connectionIndex: assemblyTutorialConnectionIndex,
      });
      assemblyTutorialChainIndex = next.chainIndex;
      assemblyTutorialConnectionIndex = next.connectionIndex;
      assemblyTutorialPanelIndex = assemblyTutorialPanelIndex === null ? null : 0;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialPreviousPanelButton.addEventListener("click", () => {
      const previous = previousAssemblyTutorialPanel(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        panelIndex: assemblyTutorialPanelIndex ?? assemblyTutorialConnectionIndex ?? 0,
      });
      assemblyTutorialChainIndex = previous.chainIndex;
      assemblyTutorialPanelIndex = previous.panelIndex;
      assemblyTutorialConnectionIndex = previous.panelIndex;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialNextPanelButton.addEventListener("click", () => {
      const next = nextAssemblyTutorialPanel(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        panelIndex: assemblyTutorialPanelIndex ?? assemblyTutorialConnectionIndex ?? 0,
      });
      assemblyTutorialChainIndex = next.chainIndex;
      assemblyTutorialPanelIndex = next.panelIndex;
      assemblyTutorialConnectionIndex = next.panelIndex;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialPreviousWireButton.addEventListener("click", () => {
      const previous = previousAssemblyTutorialWire(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        connectionIndex: assemblyTutorialConnectionIndex,
      });
      assemblyTutorialChainIndex = previous.chainIndex;
      assemblyTutorialConnectionIndex = previous.connectionIndex;
      assemblyTutorialPanelIndex = null;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialNextWireButton.addEventListener("click", () => {
      const next = nextAssemblyTutorialWire(assemblyTutorialModel, {
        chainIndex: assemblyTutorialChainIndex,
        connectionIndex: assemblyTutorialConnectionIndex,
      });
      assemblyTutorialChainIndex = next.chainIndex;
      assemblyTutorialConnectionIndex = next.connectionIndex;
      assemblyTutorialPanelIndex = null;
      syncAssemblyTutorialOutputControls();
      applyAssemblyTutorialView();
    });
    assemblyTutorialExitButton.addEventListener("click", () => {
      exitAssemblyTutorial();
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
    optimizeWiringButton.addEventListener("click", () => {
      void (async () => {
        optimizeWiringButton.disabled = true;
        setLogMessage("Optimizing balanced outputs, GPIOs, panel order, and physical DIN/DOUT orientation…");
        await new Promise<void>((resolvePromise) => requestAnimationFrame(() => resolvePromise()));
        try {
          const result = optimizeAutomaticWiring(
            editorDefinition,
            editorProject.panelProfile,
          );
          const project = createPanelAssemblyProject(
            result.definition,
            editorProject.source,
            editorProject.panelProfile,
          );
          await applyLoadedSculpture(createLoadedSculpture(project));
          currentProjectName.textContent = project.sculpture.name;
          setLogMessage(
            `Optimized wiring revision ${result.definition.wiring.routeRevision}: ${result.outputCount} output${result.outputCount === 1 ? "" : "s"}, ${result.chainLengths.join("/")} panels, GPIO ${result.gpios.join("/")}, approximately ${result.estimatedCableLengthMm.toFixed(1)} mm data cable. ${result.orientationPolicy === "quarter-turns" ? "Panel orientation could use 0°, 90°, 180°, or 270°." : "The active rotation gate limited panel orientation changes to 0° or 180°."}${result.discardedLegacyAddressTurnPanelIds.length > 0 ? ` Current saved poses were used as fabricated authority; ${result.discardedLegacyAddressTurnPanelIds.length} assumed legacy address-only turns were discarded.` : ""}`,
          );
        } catch (error) {
          setLogMessage(error instanceof Error ? error.message : String(error), true);
          renderRouteEditor();
        }
      })();
    });
    toggleWiringRotationGateButton.addEventListener("click", () => {
      const enable =
        editorDefinition.wiring.panelRotationConstraint !== "half-turns-only";
      const nextDefinition = setWiringPanelRotationConstraint(
        editorDefinition,
        enable,
      );
      const project = createPanelAssemblyProject(
        nextDefinition,
        editorProject.source,
        editorProject.panelProfile,
      );
      void applyLoadedSculpture(createLoadedSculpture(project)).then(() => {
        setLogMessage(enable
          ? "Manual wiring rotation gate enabled. Optimize wiring will use current saved poses as fabricated authority, discard assumed legacy address-only turns, and apply only 0/180-degree pose changes."
          : "Manual wiring rotation gate removed. Generated-part manifests still enforce 0/180-degree optimization when present.");
      }).catch((error) => {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      });
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
          setLogMessage(
            `Regenerated mapping and wiring from route revision ${edited.wiring.routeRevision}. Export the project ZIP to keep it.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
        currentLibraryProject = undefined;
        await applyLoadedSculpture(selected);
        currentProjectName.textContent = selected.definition.name;
        await loadReferencedDesignSurface();
        sculptureSelect.value = sculptureRegistry.sculptures.some(
          (entry) => entry.source === source,
        )
          ? source
          : "";
        const url = new URL(window.location.href);
        url.searchParams.set("sculptureJson", source);
        window.history.replaceState(null, "", url);
      } catch (error) {
        setLogMessage(
          error instanceof Error ? error.message : String(error),
          true,
        );
      } finally {
        loadSculptureButton.disabled = false;
      }
    };
    sculptureSelect.addEventListener("change", () => {
      if (!sculptureSelect.value) {
        developerUtilities.open = true;
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
      exitAssemblyTutorial(false);
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
      renderAssemblyTutorialControls();
      renderRouteEditor();
      resetTimeline();
      updateMappingStatus();
      tryReconnectSimulatorLink();
    });
    const applyPortableBundle = async (
      bundle: PortableProjectBundle,
      label: string,
    ): Promise<void> => {
      const selected = createLoadedSculpture(bundle.project);
      replacePortableBundle(bundle);
      await applyLoadedSculpture(selected);
      currentProjectName.textContent = selected.definition.name;
      await loadReferencedDesignSurface();
      sculptureSelect.value = "";
      sculptureJsonInput.value = label;
      setLogMessage(
        `Loaded complete project ${label} with ${bundle.assets.size} verified assets.`,
      );
    };

    const reportPortableError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      setLogMessage(message, true);
    };

    const projectPackageBytes = new Map<string, Uint8Array>();
    const projectThumbnailUrls: string[] = [];
    let projectLibraryRendered = false;
    let currentLibraryProject: ProjectLibraryEntry | undefined;
    const normalizeLocalProjectFilename = (input: string): string => {
      const base = input.trim()
        .replace(/\.loo\.zip$/i, "")
        .replace(/\.zip$/i, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "")
        .slice(0, 170);
      return `${base || "sculpture-project"}.loo.zip`;
    };
    const currentProjectPackage = async (): Promise<Uint8Array> => {
      let thumbnail: { bytes: Uint8Array; mediaType: "image/png" } | undefined;
      try {
        if (renderer) {
          thumbnail = {
            bytes: await renderer.captureFramedThumbnail(),
            mediaType: "image/png",
          };
        }
      } catch (error) {
        setLogMessage(
          `The framed thumbnail could not be rendered; the project will use its safe fallback preview. ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
      return createProjectPackageZip(
        editorDefinition,
        availableProjectAssets,
        portableProjectFolderName(editorDefinition),
        thumbnail,
      );
    };
    Object.assign(window, {
      __looUmeCaptureProjectThumbnail: async (): Promise<number[]> => {
        if (!renderer) throw new Error("The viewport renderer is unavailable.");
        renderer.setAutoRotate(false);
        renderer.updateColors(
          new Uint32Array(mapping.entries.length),
          "physical-index",
        );
        return Array.from(await renderer.captureFramedThumbnail({
          direction: { x: 0.85, y: 0.45, z: 1 },
        }));
      },
    });
    const clearProjectLibraryCache = (): void => {
      projectPackageBytes.clear();
      for (const url of projectThumbnailUrls.splice(0)) URL.revokeObjectURL(url);
      projectLibraryRendered = false;
    };
    const loadProjectPackageBytes = async (source: string): Promise<Uint8Array> => {
      const cached = projectPackageBytes.get(source);
      if (cached) return cached;
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Unable to load project ZIP: HTTP ${response.status}.`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      readProjectPackageSummary(bytes);
      projectPackageBytes.set(source, bytes);
      return bytes;
    };
    const openLibraryProject = async (entry: ProjectLibraryEntry): Promise<void> => {
      const bytes = await loadProjectPackageBytes(entry.source);
      const summary = readProjectPackageSummary(bytes);
      const bundle = await openPortableProjectZip(
        bytes,
        `${summary.manifest.id}.loo.zip`,
        loadStagedPanelProfile,
      );
      await applyPortableBundle(bundle, summary.manifest.name);
      currentProjectName.textContent = summary.manifest.name;
      currentLibraryProject = entry;
      projectLibraryDialog.close();
    };
    const refreshProjectLibrary = async (): Promise<void> => {
      clearProjectLibraryCache();
      projectLibraryRegistry = await loadProjectLibraryRegistry();
      saveLibraryProjectButton.disabled = projectLibraryRegistry.writable !== true;
      saveProjectAsButton.disabled = projectLibraryRegistry.writable !== true;
    };
    const saveAsLocalProject = async (filenameInput: string): Promise<void> => {
      const filename = normalizeLocalProjectFilename(filenameInput);
      const saved = await saveLocalProjectPackage(
        filename,
        await currentProjectPackage(),
      );
      await refreshProjectLibrary();
      currentLibraryProject = projectLibraryRegistry.projects.find((entry) =>
        entry.location === "local" && entry.filename === saved.filename
      );
      projectLibraryFilenameInput.value = saved.filename;
      setLogMessage(`Saved local project ${saved.filename}.`);
    };
    const renderProjectLibrary = async (): Promise<void> => {
      if (projectLibraryRendered) return;
      projectLibraryStatus.textContent = "Loading project ZIPs…";
      const cards = await Promise.all(projectLibraryRegistry.projects.map(
        async (entry) => {
          const card = document.createElement("article");
          card.className = "project-card-shell";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "project-card";
          try {
            let panelCount = entry.panelCount;
            let thumbnailUrl = entry.thumbnailSource;
            if (!thumbnailUrl || panelCount === undefined) {
              const bytes = await loadProjectPackageBytes(entry.source);
              const summary = readProjectPackageSummary(bytes);
              if (summary.manifest.id !== entry.id || summary.manifest.name !== entry.name) {
                throw new Error(`Project library metadata disagrees with ${entry.source}.`);
              }
              panelCount = summary.manifest.panelCount;
              thumbnailUrl = URL.createObjectURL(new Blob(
                [Uint8Array.from(summary.thumbnailBytes)],
                { type: summary.thumbnailMediaType },
              ));
              projectThumbnailUrls.push(thumbnailUrl);
            }
            const image = document.createElement("img");
            image.src = thumbnailUrl;
            image.alt = "";
            const label = document.createElement("span");
            label.textContent = entry.name;
            const detail = document.createElement("small");
            detail.textContent = `${panelCount} fixture${panelCount === 1 ? "" : "s"} · ${entry.location === "local" ? "Local" : "Bundled"} ZIP`;
            button.append(image, label, detail);
            if (entry.modifiedTimeMs !== undefined) {
              const modified = document.createElement("time");
              modified.className = "project-card-modified";
              modified.dateTime = new Date(entry.modifiedTimeMs).toISOString();
              modified.textContent = `Modified ${new Date(entry.modifiedTimeMs).toLocaleString()}`;
              button.append(modified);
            }
            if (entry.filename) {
              const filename = document.createElement("small");
              filename.className = "project-card-filename";
              filename.textContent = entry.filename;
              button.append(filename);
            }
            button.addEventListener("click", () => {
              button.disabled = true;
              projectLibraryStatus.textContent = `Opening ${entry.name}…`;
              void openLibraryProject(entry).catch((error) => {
                projectLibraryStatus.textContent = error instanceof Error
                  ? error.message
                  : String(error);
              }).finally(() => {
                button.disabled = false;
              });
            });
          } catch (error) {
            button.disabled = true;
            button.textContent = `${entry.name}: ${error instanceof Error ? error.message : String(error)}`;
          }
          card.append(button);
          if (
            entry.location && entry.filename && entry.revision &&
            projectLibraryRegistry.writable === true
          ) {
            const actions = document.createElement("div");
            actions.className = "project-card-actions";
            const renameButton = document.createElement("button");
            renameButton.type = "button";
            renameButton.textContent = "Rename";
            renameButton.addEventListener("click", () => {
              const requested = window.prompt("New project ZIP filename", entry.filename);
              if (requested === null) return;
              void (async () => {
                try {
                  const destination = normalizeLocalProjectFilename(requested);
                  const renamed = await renameProjectLibraryPackage(
                    entry.location!,
                    entry.filename!,
                    destination,
                    entry.revision!,
                  );
                  await refreshProjectLibrary();
                  if (
                    currentLibraryProject?.location === entry.location &&
                    currentLibraryProject?.filename === entry.filename
                  ) {
                    currentLibraryProject = projectLibraryRegistry.projects.find((candidate) =>
                      candidate.location === "local" && candidate.filename === renamed.filename
                    );
                  }
                  await renderProjectLibrary();
                  setLogMessage(`Renamed project to ${renamed.filename}.`);
                } catch (error) {
                  projectLibraryStatus.textContent = error instanceof Error
                    ? error.message
                    : String(error);
                }
              })();
            });
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
              if (!window.confirm(`Delete ${entry.filename}?`)) return;
              void (async () => {
                try {
                  await deleteProjectLibraryPackage(
                    entry.location!,
                    entry.filename!,
                    entry.revision!,
                  );
                  if (
                    currentLibraryProject?.location === entry.location &&
                    currentLibraryProject?.filename === entry.filename
                  ) {
                    currentLibraryProject = undefined;
                  }
                  await refreshProjectLibrary();
                  await renderProjectLibrary();
                  setLogMessage(`Deleted project ${entry.filename}.`);
                } catch (error) {
                  projectLibraryStatus.textContent = error instanceof Error
                    ? error.message
                    : String(error);
                }
              })();
            });
            actions.append(renameButton, deleteButton);
            card.append(actions);
          }
          return card;
        },
      ));
      projectLibraryGrid.replaceChildren(...cards);
      const invalidCount = projectLibraryRegistry.invalidPackages?.length ?? 0;
      projectLibraryStatus.textContent = invalidCount === 0
        ? `${cards.length} project ZIPs`
        : `${cards.length} project ZIPs · ${invalidCount} invalid package${invalidCount === 1 ? "" : "s"} ignored`;
      projectLibraryRendered = true;
    };
    openProjectLibraryButton.addEventListener("click", () => {
      projectLibraryFilenameInput.value = currentLibraryProject?.filename ??
        `${portableProjectFolderName(editorDefinition)}.loo.zip`;
      projectLibraryDialog.showModal();
      void renderProjectLibrary().catch((error) => {
        projectLibraryStatus.textContent = error instanceof Error
          ? error.message
          : String(error);
      });
    });
    saveProjectAsButton.addEventListener("click", () => {
      void (async () => {
        saveProjectAsButton.disabled = true;
        try {
          await saveAsLocalProject(projectLibraryFilenameInput.value);
          await renderProjectLibrary();
        } catch (error) {
          projectLibraryStatus.textContent = error instanceof Error
            ? error.message
            : String(error);
        } finally {
          saveProjectAsButton.disabled = projectLibraryRegistry.writable !== true;
        }
      })();
    });
    saveLibraryProjectButton.disabled = projectLibraryRegistry.writable !== true;
    saveProjectAsButton.disabled = projectLibraryRegistry.writable !== true;
    saveLibraryProjectButton.addEventListener("click", () => {
      void (async () => {
        if (!currentLibraryProject?.location ||
          !currentLibraryProject.filename || !currentLibraryProject.revision) {
          projectLibraryFilenameInput.value = `${portableProjectFolderName(editorDefinition)}.loo.zip`;
          projectLibraryDialog.showModal();
          await renderProjectLibrary();
          projectLibraryFilenameInput.focus();
          return;
        }
        if (!window.confirm(`Overwrite ${currentLibraryProject.filename}?`)) return;
        saveLibraryProjectButton.disabled = true;
        try {
          const saved = await replaceProjectLibraryPackage(
            currentLibraryProject.location,
            currentLibraryProject.filename,
            await currentProjectPackage(),
            currentLibraryProject.revision,
          );
          await refreshProjectLibrary();
          currentLibraryProject = projectLibraryRegistry.projects.find((entry) =>
            entry.location === "local" && entry.filename === saved.filename
          );
          setLogMessage(`Overwrote project ${saved.filename}.`);
        } catch (error) {
          reportPortableError(error);
        } finally {
          saveLibraryProjectButton.disabled = projectLibraryRegistry.writable !== true;
        }
      })();
    });
    window.addEventListener("beforeunload", () => {
      for (const url of projectThumbnailUrls) URL.revokeObjectURL(url);
    });

    openProjectFileButton.addEventListener("click", () => {
      projectLibraryDialog.close();
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
            currentLibraryProject = undefined;
          } else {
            const selected = await loadLocalSculpture(file);
            replacePortableBundle();
            currentLibraryProject = undefined;
            await applyLoadedSculpture(selected);
            await loadReferencedDesignSurface();
            sculptureSelect.value = "";
            sculptureJsonInput.value = file.name;
            setLogMessage(`Loaded ${file.name}.`);
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
      projectLibraryDialog.close();
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
          currentLibraryProject = undefined;
        } catch (error) {
          reportPortableError(error);
        } finally {
          projectFolderInput.value = "";
          openProjectFolderButton.disabled = false;
        }
      })();
    });

    saveProjectButton.addEventListener("click", () => {
      projectLibraryDialog.close();
      void (async () => {
        saveProjectButton.disabled = true;
        try {
          const folderName = portableProjectFolderName(editorDefinition);
          const bytes = await currentProjectPackage();
          const objectUrl = URL.createObjectURL(new Blob(
            [Uint8Array.from(bytes)],
            { type: "application/zip" },
          ));
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `${folderName}.zip`;
          link.click();
          URL.revokeObjectURL(objectUrl);
          setLogMessage(
            `Exported ${link.download} from verified in-memory project assets.`,
          );
        } catch (error) {
          reportPortableError(error);
        } finally {
          saveProjectButton.disabled = false;
        }
      })();
    });

    exportProjectFolderButton.addEventListener("click", () => {
      projectLibraryDialog.close();
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
          setLogMessage(`Exported complete project folder ${folderName}.`);
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
        } finally {
          designSurfaceFileInput.value = "";
          loadDesignSurfaceButton.disabled = false;
        }
      })();
    });
    saveSculptureFileButton.addEventListener("click", () => {
      projectLibraryDialog.close();
      const blob = new Blob([sculptureJson(editorDefinition)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${editorDefinition.id}.sculpture.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setLogMessage(`Saved ${link.download}.`);
    });

    automaticallyPlacePanelsButton.addEventListener("click", () => {
      try {
        assertRectangularPanelTools(
          editorProject.panelProfile,
          "Automatic surface placement",
        );
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
        setLogMessage(result.placedPanelIds.length === 0
          ? `The sculpture already has ${targetPanelCount} panels; nothing changed.`
          : `Placed ${result.placedPanelIds.join(", ")} across the active ${
            attachmentSurface === "design-surface" ? "GLB" : "JSON shell"
          }. Mapping and provisional wiring are refreshed; adjust poses manually${
            editorDefinition.mechanicalShell
              ? " before separate 3D generation"
              : "; 3D generation remains unavailable until boundary input exists"
          }.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLogMessage(message, true);
      }
    });
    addPanelButton.addEventListener("click", () => {
      try {
        assertRectangularPanelTools(
          editorProject.panelProfile,
          "Closure-face panel placement",
        );
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
        setLogMessage(
          `Added ${edited.panels.at(-1)!.id} to ${faceId}. Save the project ZIP or build the assembly package.`,
        );
      } catch (error) {
        setLogMessage(
          error instanceof Error ? error.message : String(error),
          true,
        );
      }
    });
    addPanelFaceSelect.addEventListener("change", () => {
      const hasEligibleSelection = addPanelFaceSelect.value !== "";
      addPanelButton.hidden = !hasEligibleSelection;
      addPanelButton.disabled = !hasEligibleSelection;
    });
    const createCurrentAssemblyManualModel = () =>
      createWiringAssemblyManualModel(
        editorDefinition,
        hardwareContract,
        editorProject.panelProfile,
        editorProject.source,
      );
    const createCurrentAssemblyManualDocument = (): string => {
      return renderStandaloneWiringAssemblyManualDocument(
        createCurrentAssemblyManualModel(),
        wiringManualStyles,
      );
    };

    const downloadAssemblyPackage = (): void => {
      if (!verifiedGeneratedMechanics) {
        throw new Error("Build the assembly package before downloading it.");
      }
      const zipBytes = createAssemblyPackageZip(
        editorDefinition,
        availableProjectAssets,
        {
          assemblyManualHtml: createCurrentAssemblyManualDocument(),
          hardwareContract,
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
      setLogMessage(hardwareContract.readiness.mappingReady
          ? `Downloaded ${link.download} with the project, verified geometry, assembly manual, and guarded WLED installation bundle.`
          : `Downloaded ${link.download} with the project, verified geometry, assembly manual, and diagnostic-only mapping files.`);
    };

    const downloadMadMapperPackage = (): void => {
      const zipBytes = createMadMapperPackageZip(
        hardwareContract,
        editorDefinition.id,
      );
      const objectUrl = URL.createObjectURL(new Blob(
        [Uint8Array.from(zipBytes)],
        { type: "application/zip" },
      ));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        `${portableProjectFolderName(editorDefinition)}-madmapper.zip`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setLogMessage(
        `Downloaded ${link.download} with ${hardwareContract.mapping.entries.length} physical RGB fixtures in ${hardwareContract.mapping.panels.length} panel groups, the Art-Net patch, mapping manifest, and draft setup PDF.`,
      );
    };

    const downloadFabricationPackage = (): void => {
      const zipBytes = createFabricationPackageZip(
        editorDefinition.panels.map((panel) => panel.id),
        {
          manufacturingManualPdf: createManufacturingManualPdf(
            createCurrentAssemblyManualModel(),
          ),
          mechanics: verifiedGeneratedMechanics,
          structure: verifiedGeneratedStructure,
        },
      );
      const objectUrl = URL.createObjectURL(new Blob(
        [Uint8Array.from(zipBytes)],
        { type: "application/zip" },
      ));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        `${portableProjectFolderName(editorDefinition)}-fabrication.zip`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setLogMessage(
        `Downloaded ${link.download} with the HERMA 4385 PDF for ${editorDefinition.panels.length} panel IDs, the manufacturing manual, ${verifiedGeneratedMechanics ? `${verifiedGeneratedMechanics.parts.length + 1} planar STL files` : "no current planar STL files"}, and ${verifiedGeneratedStructure ? "the complete verified structural connector package" : "no current structural connector package"}. Print PDFs at 100% or Actual size; do not use Fit to page.`,
      );
    };

    const generateStructuralStyle = async (
      surfaceStyle: StructuralConnectorSurfaceStyle,
    ): Promise<void> => {
      generateStructureButton.disabled = true;
      generateSurfaceStructureButton.disabled = true;
      assemblyPackageButton.disabled = true;
      addPanelButton.disabled = true;
      setLogMessage(surfaceStyle === "led-surface-bridge"
          ? "Generating full-edge bridges at the LED planes and running optional load-path analysis…"
          : "Generating nearest-hole ribbon geometry and running optional load-path analysis…");
        try {
          const structuralDefinition = structuredClone(editorDefinition);
          delete structuralDefinition.generatedMechanics;
          delete structuralDefinition.mechanicalShell;
          delete structuralDefinition.closures;
          structuralDefinition.structuralDesign ??= structuredClone(STRUCTURAL_PREVIEW_DEFAULTS);
          structuralDefinition.structuralDesign.connectorization = {
            ...resolvedConnectorization(),
            surfaceStyle,
          };
          const structuralProject = createPanelAssemblyProject(
            structuralDefinition,
            editorProject.source,
            editorProject.panelProfile,
          );
          const designSurfaceBytes = structuralDefinition.designSurface
            ? availableProjectAssets.get(structuralDefinition.designSurface.source)
            : undefined;
          const result = await runStructuralPipeline(structuralProject, {
            ...(designSurfaceBytes ? { designSurfaceBytes } : {}),
          });
          const previousAssets = new Map(availableProjectAssets);
          const previousUrls = generatedMemoryUrls;
          const nextUrls = new Map<string, string>();
          try {
            for (const file of result.bundle.files) {
              rememberProjectAsset(file.source, file.bytes);
              if (result.generatedStructure.artifacts.some(({ source }) => source === file.source)) {
                nextUrls.set(file.source, URL.createObjectURL(new Blob(
                  [Uint8Array.from(file.bytes)],
                )));
              }
            }
            generatedMemoryUrls = nextUrls;
            const generatedProject = createPanelAssemblyProject(
              result.definition,
              "local:in-process-structural",
              editorProject.panelProfile,
            );
            await applyLoadedSculpture(createLoadedSculpture(generatedProject));
            previousUrls.forEach((url) => URL.revokeObjectURL(url));
          } catch (error) {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
            generatedMemoryUrls = previousUrls;
            availableProjectAssets = previousAssets;
            throw error;
          }
          const loftBodyCount = result.analysis.printable.organicConnectors;
          const junctionCount = result.analysis.printable.multiPanelJunctions;
          const surfaceBridgeCount = result.analysis.printable.surfaceBridges;
          const surfaceJunctionCount = result.analysis.printable.surfaceBridgeJunctions;
          const generatedShape = surfaceStyle === "led-surface-bridge"
            ? `${surfaceBridgeCount} full-edge ${surfaceBridgeCount === 1 ? "bridge" : "bridges"} and ${surfaceJunctionCount} multi-panel surface ${surfaceJunctionCount === 1 ? "junction" : "junctions"}`
            : `${loftBodyCount} cap-surface loft ${loftBodyCount === 1 ? "body" : "bodies"} and ${junctionCount} multi-panel ribbon ${junctionCount === 1 ? "junction" : "junctions"}`;
          setLogMessage(
            `Generated and SHA-256 verified ${result.analysis.candidate.connectorCells} local panel-pair connectors as ${generatedShape}. ` +
            (result.analysis.printable.splitMembers > 0
              ? `PRINT SPLIT WARNING: ${result.analysis.printable.splitMembers} member(s) require numbered segments and splice sleeves. `
              : "") +
            (result.analysis.optimization.status !== "converged"
              ? `Advisory truss analysis: ${result.analysis.optimization.status}; ${surfaceStyle === "led-surface-bridge" ? "surface-bridge" : "ribbon"} generation is unaffected. `
              : "") +
            `The package also contains 3MF, preview, analysis, and report. ${result.analysis.disclaimer}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
        } finally {
          renderEditorFaces();
          updatePipelineAvailability();
        }
    };

    generateStructureButton.addEventListener("click", () => {
      void generateStructuralStyle("screw-shoe-ribbon");
    });
    generateSurfaceStructureButton.addEventListener("click", () => {
      void generateStructuralStyle("led-surface-bridge");
    });

    const buildAssemblyPackage = async (): Promise<void> => {
        assemblyPackageButton.disabled = true;
        addPanelButton.disabled = true;
        setLogMessage(editorDefinition.boundaryTopology
          ? "Deriving exact panel outlines and validating flat gap caps…"
          : editorDefinition.mechanicalShell && editorDefinition.closures
            ? "Regenerating mechanical topology, then generating Manifold STLs and printable previews…"
            : "Detecting unambiguous flat gap cycles from exact panel outlines, then validating and generating printable parts…");
        try {
          try {
            const planarDefinition = structuredClone(editorDefinition);
            delete planarDefinition.generatedStructure;
            const planarProject = createPanelAssemblyProject(
              planarDefinition,
              editorProject.source,
              editorProject.panelProfile,
            );
            const bundle = await compilePanelBoundaryBundle(
              planarProject,
              planarDefinition.panelProfile.source,
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
            setLogMessage(
              `Built and SHA-256 verified ${partCount} printable parts. The assembly package is ready to download.`,
            );
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
          setLogMessage(
            lastLogLine ?? "Pipeline complete; exact STL meshes are now loaded.",
          );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLogMessage(message, true);
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
          setLogMessage(message, true);
          updatePipelineAvailability();
        }
      })();
    });
    downloadMadMapperPackageButton.addEventListener("click", () => {
      try {
        downloadMadMapperPackage();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLogMessage(message, true);
        updatePipelineAvailability();
      }
    });
    downloadPanelLabelsButton.addEventListener("click", () => {
      try {
        downloadFabricationPackage();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLogMessage(message, true);
        updatePipelineAvailability();
      }
    });
    madMapperPreviewButton.addEventListener("click", () => {
      try {
        startMadMapperPreview();
      } catch (error) {
        setLogMessage(error instanceof Error ? error.message : String(error), true);
      }
    });
    ledCountInput.value = String(mapping.entries.length);
    renderEditorFaces();
    renderConnectorControls();
    renderAssemblyTutorialControls();
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
    setLogMessage(`Browser bundle: ${browserBundleName}.`);

    await restoreGeneratedMechanics(loadedSculpture);
    await loadReferencedDesignSurface();

    const animate = (now: number): void => {
      const delta = Math.min(now - previousTime, 100);
      previousTime = now;
      simulationTime += delta;
      engine.tick(Math.floor(simulationTime));

      const artNetFrameIsCurrent =
        artNetPreviewClient.active &&
        artNetPreviewPixels !== undefined &&
        now - artNetPreviewLastFrameAt <= 1_000;
      if (
        artNetPreviewClient.active &&
        artNetPreviewPixels !== undefined &&
        !artNetFrameIsCurrent &&
        !artNetPreviewTimedOut
      ) {
        artNetPreviewTimedOut = true;
        madMapperPreviewStatus.textContent = "Signal timeout · native simulation shown";
      }
      renderer?.updateColors(
        physicalRouteReviewDemoPixels ??
          (artNetFrameIsCurrent ? artNetPreviewPixels! : engine.pixels),
        physicalRouteReviewDemoPixels !== undefined || artNetFrameIsCurrent
          ? "wled"
          : currentDisplayMode,
      );
      renderer?.render();

      if (
        !simulatorSetupActive &&
        !physicalRouteReviewSession &&
        !standaloneSaveRequest &&
        simulatorDeviceUrl &&
        !simulatorFrameRequest &&
        now >= nextSimulatorFrameAt
      ) {
        nextSimulatorFrameAt = now + 100;
        simulatorFrameRequest = Promise.resolve().then(() =>
          sendSimulatorFramebuffer(
            simulatorDeviceUrl!,
            physicalSimulatorFramebuffer(),
          )
        ).then(() => {
          if (simulatorLinkFailed) {
            simulatorLinkFailed = false;
            setLogMessage("Live simulator hardware link reconnected.");
          }
        }).catch((error) => {
          if (!simulatorLinkFailed) {
            simulatorLinkFailed = true;
            setLogMessage(
              `Live simulator hardware link paused: ${error instanceof Error ? error.message : String(error)}`,
              true,
            );
          }
          nextSimulatorFrameAt = performance.now() + 5_000;
        }).finally(() => {
          simulatorFrameRequest = undefined;
        });
      }

      if (engine.outOfBoundsWriteCount > 0) {
        setLogMessage(
          `Guard caught ${engine.outOfBoundsWriteCount} out-of-range pixel writes.`,
          true,
        );
      }
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLogMessage(message, true);
    console.error(error);
  }
}

void start();

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  renderer?.dispose();
});
