import type { PanelHardwareProfile, PanelCorner } from "../../src/sculpture/Definition.ts";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";
import { transformInstalledPanelCoordinate } from "./HardwareMapping.ts";
import type { PanelDefinition, Vector3Data } from "./LedMapping.ts";

const OUTPUT_COLORS = ["#d52d2d", "#1677b8", "#14804a", "#a45a00"];
const DISPLAY_CORNERS: PanelCorner[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];

export interface WiringManualPanel {
  id: string;
  chainPosition: number;
  physicalStart: number;
  physicalEnd: number;
  dataIn: string;
  dataOut: string;
  turnDegrees: 0 | 90 | 180 | 270;
  mirrored: boolean;
  dinCorner: PanelCorner;
  doutCorner: PanelCorner;
  position: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  width: number;
  height: number;
}

export interface WiringManualOutput {
  outputIndex: number;
  label: string;
  gpio: number;
  color: string;
  physicalStart: number;
  physicalEnd: number;
  panels: WiringManualPanel[];
}

export interface WiringAssemblyManualModel {
  sculptureId: string;
  sculptureName: string;
  source: string;
  routeRevision: number;
  wiringStatus: string;
  mappingFingerprint: string;
  optimizationFingerprint: string;
  totalPixels: number;
  colorOrder: "RGB";
  pixelOrder: string;
  outputs: WiringManualOutput[];
}

function cornerCoordinate(
  corner: PanelCorner,
  columns: number,
  rows: number,
): { x: number; y: number } {
  return {
    x: corner.endsWith("left") ? 0 : columns - 1,
    y: corner.startsWith("top") ? 0 : rows - 1,
  };
}

function displayCornerForPcbCorner(
  panel: PanelDefinition,
  pcbCorner: PanelCorner,
  profile: PanelHardwareProfile,
): PanelCorner {
  const target = cornerCoordinate(
    pcbCorner,
    profile.pixelGrid.columns,
    profile.pixelGrid.rows,
  );
  const match = DISPLAY_CORNERS.find((corner) => {
    const point = cornerCoordinate(
      corner,
      profile.pixelGrid.columns,
      profile.pixelGrid.rows,
    );
    const transformed = transformInstalledPanelCoordinate(
      point.x,
      point.y,
      panel.installedAddressTransform,
      profile.pixelGrid.columns,
      profile.pixelGrid.rows,
    );
    return transformed.x === target.x && transformed.y === target.y;
  });
  if (!match) throw new Error(`Panel ${panel.id} does not map connector corners.`);
  return match;
}

export function createWiringAssemblyManualModel(
  definition: PanelAssemblyDefinition,
  contract: HardwareMappingContract,
  profile: PanelHardwareProfile,
  source: string,
): WiringAssemblyManualModel {
  if (!contract.readiness.mappingReady) {
    throw new Error(
      "The printable wiring manual requires a current mapping-ready project.",
    );
  }
  if (contract.wiring.routeSource !== "authored-route") {
    throw new Error("The printable wiring manual requires the saved authored route.");
  }
  if (contract.mapping.panels.some(
    (panel) => panel.installedAddressTransform.mirrored,
  )) {
    throw new Error(
      "The printable wiring manual does not support mirrored installed panels.",
    );
  }
  const panelById = new Map(
    contract.mapping.panels.map((panel) => [panel.id, panel]),
  );
  const ledsPerPanel = profile.pixelGrid.columns * profile.pixelGrid.rows;
  const outputs = contract.outputs.map((output) => {
    if (output.gpio === null) {
      throw new Error(`Output ${output.outputIndex + 1} has no GPIO.`);
    }
    const panels = output.panelIds.map((panelId, chainPosition) => {
      const panel = panelById.get(panelId);
      if (!panel) throw new Error(`Output route references unknown panel ${panelId}.`);
      const previous = output.panelIds[chainPosition - 1] ?? null;
      const next = output.panelIds[chainPosition + 1] ?? null;
      const physicalStart = output.startIndex + chainPosition * ledsPerPanel;
      return {
        id: panel.id,
        chainPosition,
        physicalStart,
        physicalEnd: physicalStart + ledsPerPanel - 1,
        dataIn: previous ? `${previous} DOUT` : `Controller GPIO ${output.gpio}`,
        dataOut: next ? `${next} DIN` : `End of ${definition.wiring.outputs[output.outputIndex]!.label}`,
        turnDegrees: (
          ((4 - panel.installedAddressTransform.quarterTurnsClockwise) % 4) * 90
        ) as
          0 | 90 | 180 | 270,
        mirrored: panel.installedAddressTransform.mirrored,
        dinCorner: displayCornerForPcbCorner(
          panel,
          profile.dataConnectors.dinCorner,
          profile,
        ),
        doutCorner: displayCornerForPcbCorner(
          panel,
          profile.dataConnectors.doutCorner,
          profile,
        ),
        position: panel.position,
        xAxis: panel.xAxis,
        yAxis: panel.yAxis,
        width: panel.previewWidth,
        height: panel.previewHeight,
      } satisfies WiringManualPanel;
    });
    return {
      outputIndex: output.outputIndex,
      label: definition.wiring.outputs[output.outputIndex]!.label,
      gpio: output.gpio,
      color: OUTPUT_COLORS[output.outputIndex] ?? "#333333",
      physicalStart: output.startIndex,
      physicalEnd: output.startIndex + output.pixelCount - 1,
      panels,
    };
  });
  const optimizationFingerprints = new Set(
    definition.panels.map(
      (panel) => panel.installedAddressTransform?.optimizationFingerprint,
    ),
  );
  if (optimizationFingerprints.size !== 1 || optimizationFingerprints.has(undefined)) {
    throw new Error("Panels do not share one current orientation fingerprint.");
  }
  return {
    sculptureId: definition.id,
    sculptureName: definition.name,
    source,
    routeRevision: definition.wiring.routeRevision ?? 0,
    wiringStatus: contract.wiring.status,
    mappingFingerprint: contract.fingerprint,
    optimizationFingerprint: [...optimizationFingerprints][0]!,
    totalPixels: contract.mapping.entries.length,
    colorOrder: "RGB",
    pixelOrder: `${profile.pixelGrid.columns} × ${profile.pixelGrid.rows} snake`,
    outputs,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function pointAtCorner(corner: PanelCorner): { x: number; y: number } {
  return {
    x: corner.endsWith("left") ? 12 : 68,
    y: corner.startsWith("top") ? 12 : 48,
  };
}

function orientationDiagram(panel: WiringManualPanel): string {
  const din = pointAtCorner(panel.dinCorner);
  const dout = pointAtCorner(panel.doutCorner);
  return `<svg class="orientation-diagram" viewBox="0 0 80 60" aria-label="Back view of ${escapeHtml(panel.id)}">
    <rect x="5" y="5" width="70" height="50" rx="3" fill="#11161a" stroke="#4c5962" />
    <text x="40" y="25" text-anchor="middle" class="orientation-id">${escapeHtml(panel.id)}</text>
    <text x="40" y="37" text-anchor="middle" class="orientation-turn">${panel.turnDegrees}° CW</text>
    <circle cx="${din.x}" cy="${din.y}" r="4" class="din-dot" />
    <text x="${din.x}" y="${din.y - 6}" text-anchor="middle" class="corner-label">IN</text>
    <circle cx="${dout.x}" cy="${dout.y}" r="4" class="dout-dot" />
    <text x="${dout.x}" y="${dout.y - 6}" text-anchor="middle" class="corner-label">OUT</text>
  </svg>`;
}

type ProjectionName = "front" | "right" | "top";

function vectorValue(vector: Vector3Data, axis: "x" | "y" | "z"): number {
  return vector[axis];
}

function panelCorners(panel: WiringManualPanel): Vector3Data[] {
  const halfWidth = panel.width / 2;
  const halfHeight = panel.height / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([xSign, ySign]) => ({
    x: panel.position.x + panel.xAxis.x * halfWidth * xSign! + panel.yAxis.x * halfHeight * ySign!,
    y: panel.position.y + panel.xAxis.y * halfWidth * xSign! + panel.yAxis.y * halfHeight * ySign!,
    z: panel.position.z + panel.xAxis.z * halfWidth * xSign! + panel.yAxis.z * halfHeight * ySign!,
  }));
}

function projectionAxes(name: ProjectionName): {
  title: string;
  u: "x" | "y" | "z";
  v: "x" | "y" | "z";
  depth: "x" | "y" | "z";
  flipU: boolean;
  flipV: boolean;
} {
  if (name === "front") {
    return { title: "Front · look from +Z", u: "x", v: "y", depth: "z", flipU: false, flipV: true };
  }
  if (name === "right") {
    return { title: "Right · look from +X", u: "z", v: "y", depth: "x", flipU: true, flipV: true };
  }
  return { title: "Top · look from +Y", u: "x", v: "z", depth: "y", flipU: false, flipV: false };
}

function renderProjection(
  model: WiringAssemblyManualModel,
  name: ProjectionName,
): string {
  const width = 340;
  const height = 250;
  const margin = 20;
  const axes = projectionAxes(name);
  const panels = model.outputs.flatMap((output) =>
    output.panels.map((panel) => ({ panel, output })),
  );
  const allCorners = panels.flatMap(({ panel }) => panelCorners(panel));
  const uValues = allCorners.map((point) => vectorValue(point, axes.u));
  const vValues = allCorners.map((point) => vectorValue(point, axes.v));
  const minU = Math.min(...uValues);
  const maxU = Math.max(...uValues);
  const minV = Math.min(...vValues);
  const maxV = Math.max(...vValues);
  const scale = Math.min(
    (width - margin * 2) / Math.max(maxU - minU, 1),
    (height - margin * 2) / Math.max(maxV - minV, 1),
  );
  const project = (point: Vector3Data): { x: number; y: number } => {
    const x = margin + (vectorValue(point, axes.u) - minU) * scale;
    const rawY = margin + (vectorValue(point, axes.v) - minV) * scale;
    return {
      x: axes.flipU ? width - x : x,
      y: axes.flipV ? height - rawY : rawY,
    };
  };
  const routeSegments = model.outputs.flatMap((output) =>
    output.panels.slice(1).map((panel, index) => {
      const start = project(output.panels[index]!.position);
      const end = project(panel.position);
      const arrowStart = {
        x: start.x + (end.x - start.x) * 0.42,
        y: start.y + (end.y - start.y) * 0.42,
      };
      const arrowEnd = {
        x: start.x + (end.x - start.x) * 0.58,
        y: start.y + (end.y - start.y) * 0.58,
      };
      return {
        line: `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${output.color}" />`,
        arrow: `<line x1="${arrowStart.x.toFixed(1)}" y1="${arrowStart.y.toFixed(1)}" x2="${arrowEnd.x.toFixed(1)}" y2="${arrowEnd.y.toFixed(1)}" stroke="${output.color}" marker-end="url(#arrow-${name}-${output.outputIndex})" />`,
      };
    }),
  );
  const routeLines = routeSegments.map((segment) => segment.line).join("");
  const routeArrows = routeSegments.map((segment) => segment.arrow).join("");
  const panelShapes = [...panels]
    .sort((left, right) =>
      vectorValue(left.panel.position, axes.depth) -
      vectorValue(right.panel.position, axes.depth)
    )
    .map(({ panel, output }) => {
      const corners = panelCorners(panel).map(project);
      const center = project(panel.position);
      const points = corners.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
      return `<g class="projection-panel">
        <polygon points="${points}" fill="#11161a" fill-opacity="0.78" stroke="${output.color}" />
        <rect x="${(center.x - 14).toFixed(1)}" y="${(center.y - 6).toFixed(1)}" width="28" height="12" rx="2" fill="#11161a" stroke="${output.color}" />
        <text x="${center.x.toFixed(1)}" y="${(center.y + 2.7).toFixed(1)}" text-anchor="middle">${escapeHtml(panel.id)}</text>
      </g>`;
    }).join("");
  const markers = model.outputs.map((output) =>
    `<marker id="arrow-${name}-${output.outputIndex}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${output.color}" /></marker>`,
  ).join("");
  return `<figure class="projection-card">
    <figcaption>${axes.title}</figcaption>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${axes.title} panel placement">
      <defs>${markers}</defs>
      <g class="route-lines">${routeLines}</g>
      ${panelShapes}
      <g class="route-arrows">${routeArrows}</g>
    </svg>
  </figure>`;
}

function renderChainStrip(output: WiringManualOutput): string {
  return `<div class="chain-strip" aria-label="${escapeHtml(output.label)} route">${output.panels.map(
    (panel, index) => `<div class="chain-node" style="--output-color:${output.color}">
      <strong>${escapeHtml(panel.id)}</strong><small>${panel.turnDegrees}° CW</small>
    </div>${index < output.panels.length - 1 ? '<span class="chain-arrow">→</span>' : ""}`,
  ).join("")}</div>`;
}

function renderOutputPage(output: WiringManualOutput): string {
  const rows = output.panels.map((panel) => `<tr>
    <td class="check-cell">□</td>
    <td>${panel.chainPosition + 1}</td>
    <td><strong>${escapeHtml(panel.id)}</strong></td>
    <td>${orientationDiagram(panel)}</td>
    <td><strong>${escapeHtml(panel.dataIn)}</strong><br><span class="muted">to ${escapeHtml(panel.id)} DIN · ${panel.dinCorner}</span></td>
    <td><strong>${escapeHtml(panel.id)} DOUT</strong><br><span class="muted">to ${escapeHtml(panel.dataOut)} · ${panel.doutCorner}</span></td>
    <td>${panel.physicalStart}–${panel.physicalEnd}</td>
  </tr>`).join("");
  return `<section class="sheet chain-sheet" style="--output-color:${output.color}">
    <header class="sheet-header">
      <div><p class="eyebrow">DATA OUTPUT ${output.outputIndex + 1}</p><h2>${escapeHtml(output.label)} · GPIO ${output.gpio}</h2></div>
      <div class="range-badge">${output.panels.length} panels · LEDs ${output.physicalStart}–${output.physicalEnd}</div>
    </header>
    <p>Start at the controller. Follow the arrows. View every PCB from the back. Connector corners are authoritative; pad centres are schematic. Connect data and reference ground; do not carry accumulated panel power through this data chain. Mapping-ready does not mean electrically approved.</p>
    ${renderChainStrip(output)}
    <table class="chain-table">
      <thead><tr><th>Done</th><th>Pos.</th><th>Panel</th><th>Back-view PCB orientation</th><th>Data into DIN</th><th>Data out from DOUT</th><th>Physical LEDs</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer class="sheet-footer">${escapeHtml(output.label)} · GPIO ${output.gpio} · Follow panel IDs and saved orientation exactly.</footer>
  </section>`;
}

export function renderWiringAssemblyManualHtml(
  model: WiringAssemblyManualModel,
): string {
  const outputSummary = model.outputs.map((output) => `<tr>
    <td><span class="output-key" style="--output-color:${output.color}"></span>${escapeHtml(output.label)}</td>
    <td>${output.gpio}</td><td>${output.panels.length}</td><td>${output.physicalStart}–${output.physicalEnd}</td>
    <td>${escapeHtml(output.panels[0]!.id)} → ${escapeHtml(output.panels.at(-1)!.id)}</td>
  </tr>`).join("");
  return `<main class="manual">
    <section class="sheet cover-sheet">
      <div class="screen-actions no-print"><button id="print-manual" type="button">Print manual</button><a id="back-to-simulator" href="./">Back to simulator</a></div>
      <p class="eyebrow">WLED ORBITAL LAB · ASSEMBLY CONTROL COPY</p>
      <h1>${escapeHtml(model.sculptureName)}<br>Wiring assembly manual</h1>
      <div class="status-banner">MAPPING READY · ${model.totalPixels.toLocaleString()} LEDs · ${model.outputs.length} outputs</div>
      <div class="cover-grid">
        <section><h2>Use this manual for</h2><ol><li>Label each PCB with its panel ID.</li><li>Place it at the matching ID in the projection sheets.</li><li>Rotate it as shown from the back.</li><li>Connect the exact controller → DIN → DOUT chain.</li><li>Tick each completed row before continuing.</li></ol></section>
        <section><h2>Fixed mapping assumptions</h2><dl><dt>Pixel order</dt><dd>${model.pixelOrder}</dd><dt>Color order</dt><dd>${model.colorOrder}</dd><dt>Mirroring</dt><dd>None</dd><dt>Route revision</dt><dd>${model.routeRevision}</dd><dt>Mapping fingerprint</dt><dd><code>${model.mappingFingerprint}</code></dd><dt>Orientation fingerprint</dt><dd><code>${model.optimizationFingerprint}</code></dd></dl></section>
      </div>
      <div class="warning"><strong>Data direction:</strong> controller GPIO → first panel DIN → panel DOUT → next panel DIN. Connect a reference ground with every data chain. Panel power distribution is separate. Connector corners are authoritative; exact pad centres are schematic.</div>
      <table class="summary-table"><thead><tr><th>Output</th><th>GPIO</th><th>Panels</th><th>Physical LEDs</th><th>First → last panel</th></tr></thead><tbody>${outputSummary}</tbody></table>
      <footer class="sheet-footer">Source: ${escapeHtml(model.source)} · Wiring ${escapeHtml(model.wiringStatus)} · Mapping-ready assumptions; electrical approval is separate.</footer>
    </section>
    <section class="sheet placement-sheet">
      <header class="sheet-header"><div><p class="eyebrow">PLACEMENT MAP</p><h2>Find each panel in the sculpture</h2></div><div class="range-badge">Route arrows show data direction</div></header>
      <p>Use at least two views to identify a position. Panel rectangles are projected from the saved 3D poses; overlaps are normal in an orthographic view.</p>
      <div class="projection-grid">${renderProjection(model, "front")}${renderProjection(model, "right")}${renderProjection(model, "top")}</div>
      <div class="output-legend">${model.outputs.map((output) => `<span><i style="--output-color:${output.color}"></i>${escapeHtml(output.label)} · GPIO ${output.gpio}</span>`).join("")}</div>
      <footer class="sheet-footer">Panel IDs and positions come from the current Schema 2 sculpture poses · Mapping-ready assumptions; electrical approval is separate.</footer>
    </section>
    ${model.outputs.map(renderOutputPage).join("")}
  </main>`;
}
