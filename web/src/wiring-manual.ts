import "./wiring-manual.css";
import {
  createPanelAssemblyMapping,
  loadPanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "./HardwareMapping.ts";
import { createProvisionalWiringPreview } from "./WiringPreview.ts";
import {
  createWiringAssemblyManualModel,
  renderWiringAssemblyManualHtml,
  type WiringAssemblyManualModel,
} from "./WiringAssemblyManual.ts";

const DEFAULT_SOURCE = "./sculptures/rhombicosidodecahedron/sculpture.json";
const appElement = document.querySelector<HTMLElement>("#manual-app");
if (!appElement) throw new Error("Missing #manual-app.");
const app: HTMLElement = appElement;

function displayManual(model: WiringAssemblyManualModel): void {
  document.title = `${model.sculptureName} wiring manual`;
  app.innerHTML = renderWiringAssemblyManualHtml(model);
  document.querySelector<HTMLButtonElement>("#print-manual")?.addEventListener(
    "click",
    () => window.print(),
  );
  const backLink = document.querySelector<HTMLAnchorElement>("#back-to-simulator");
  if (backLink) {
    if (editorToken && window.opener) {
      backLink.href = "#";
      backLink.addEventListener("click", (event) => {
        event.preventDefault();
        window.opener?.focus();
      });
    } else {
      const simulatorUrl = new URL("./", window.location.href);
      simulatorUrl.searchParams.delete("fromEditor");
      simulatorUrl.searchParams.set("sculptureJson", model.source);
      backLink.href = simulatorUrl.href;
    }
  }
}

async function loadManual(): Promise<void> {
  const source = new URLSearchParams(window.location.search).get("sculptureJson") ??
    DEFAULT_SOURCE;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load sculpture JSON: HTTP ${response.status}.`);
  }
  const input: unknown = await response.json();
  const project = await loadPanelAssemblyProject(
    input,
    source,
    async (reference) => {
      const profileResponse = await fetch(new URL(reference.source, response.url));
      if (!profileResponse.ok) {
        throw new Error(`Unable to load panel profile: HTTP ${profileResponse.status}.`);
      }
      return profileResponse.json() as Promise<unknown>;
    },
  );
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  const contract = createHardwareMappingContract(
    mapping,
    wiring,
    project.panelProfile,
  );
  const model = createWiringAssemblyManualModel(
    project.sculpture,
    contract,
    project.panelProfile,
    source,
  );
  displayManual(model);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const main = document.createElement("main");
  main.className = "manual-error";
  const heading = document.createElement("h1");
  heading.textContent = "Wiring manual unavailable";
  const detail = document.createElement("p");
  detail.textContent = message;
  main.append(heading, detail);
  app.replaceChildren(main);
}

const editorToken = new URLSearchParams(window.location.search).get("fromEditor");
if (editorToken && window.opener) {
  const receiveModel = (event: MessageEvent<unknown>): void => {
    if (
      event.origin !== window.location.origin ||
      event.source !== window.opener ||
      typeof event.data !== "object" ||
      event.data === null ||
      !("type" in event.data) ||
      event.data.type !== "wiring-manual-model" ||
      !("token" in event.data) ||
      event.data.token !== editorToken ||
      !("model" in event.data)
    ) return;
    window.removeEventListener("message", receiveModel);
    try {
      displayManual(event.data.model as WiringAssemblyManualModel);
    } catch (error) {
      showError(error);
    }
  };
  window.addEventListener("message", receiveModel);
  window.opener.postMessage(
    { type: "wiring-manual-ready", token: editorToken },
    window.location.origin,
  );
} else {
  void loadManual().catch(showError);
}
