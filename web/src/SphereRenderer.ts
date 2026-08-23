import * as THREE from "three";
import { focusedGrey, selectionDisplayColor } from "./SelectionFocus.ts";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type {
  LedMapping,
  MechanicalMountPreview,
  PrintableClosurePreview,
  PanelDefinition,
  SculptureSurfaceFace,
  Vector3Data,
} from "./LedMapping";
import type { WiringPreview } from "./WiringPreview";
import type { EditorCapabilities } from "./EditorCapabilities.ts";
import type { ClosedPanelBoundary } from "../../src/sculpture/PanelOutlineBoundary.ts";
import type { VerifiedGeneratedMechanics } from "./GeneratedMechanicsAssets.ts";
import {
  SurfacePlacementController,
  type SurfacePanelPlacement,
  type SurfacePlacement,
} from "./SurfacePlacementController";

export type DisplayMode = "wled" | "physical-index" | "logical-index";

interface PanelLabel {
  object: CSS2DObject;
  element: HTMLSpanElement;
  normal: THREE.Vector3;
}

function createLedSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create LED sprite texture.");
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.5, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.72, "rgba(255, 255, 255, 0.72)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class SphereRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly panelLayer = new THREE.Group();
  private readonly boundaryPreviewLayer = new THREE.Group();
  private readonly printableLayer = new THREE.Group();
  private readonly connectorLayer = new THREE.Group();
  private readonly wiringLayer = new THREE.Group();
  private readonly connectorOutputLayers = new Map<number, THREE.Group>();
  private readonly wiringOutputLayers = new Map<number, THREE.Group>();
  private readonly outputVisibility = new Map<number, boolean>([
    [0, true],
    [1, true],
    [2, true],
    [3, true],
  ]);
  private readonly panelLabels: PanelLabel[] = [];
  private readonly controls: OrbitControls;
  private readonly surfacePlacement: SurfacePlacementController;
  private readonly stlLoader = new STLLoader();
  private mappingRevision = 0;
  private shellTransparency = 0.35;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly ledTexture = createLedSpriteTexture();
  private readonly material = new THREE.PointsMaterial({
    size: 8.8,
    vertexColors: true,
    map: this.ledTexture,
    transparent: true,
    alphaTest: 0.08,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  private readonly points = new THREE.Points(this.geometry, this.material);
  private grid: THREE.GridHelper | undefined;
  private readonly color = new THREE.Color();
  private baseLedColors = new Float32Array();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private mapping: LedMapping;
  private panelLabelsVisible = true;
  private selectedPanelId: string | null = null;
  private panelThickness = 0.8;

  constructor(
    private readonly container: HTMLElement,
    mapping: LedMapping,
  ) {
    this.mapping = mapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.container.append(this.renderer.domElement);
    this.labelRenderer.domElement.className = "panel-label-layer";
    this.container.append(this.labelRenderer.domElement);

    this.camera.position.set(0, 30, 320);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 145;
    this.controls.maxDistance = 480;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.surfacePlacement = new SurfacePlacementController(
      this.scene,
      this.camera,
      this.renderer.domElement,
      this.controls,
    );

    this.points.renderOrder = 4;
    const pcbKeyLight = new THREE.DirectionalLight(0xd8efff, 2.1);
    pcbKeyLight.position.set(180, 220, 260);
    const pcbFillLight = new THREE.HemisphereLight(0x8aa7bd, 0x06080b, 1.2);
    this.scene.add(
      pcbKeyLight,
      pcbFillLight,
      this.panelLayer,
      this.boundaryPreviewLayer,
      this.printableLayer,
      this.wiringLayer,
      this.connectorLayer,
      this.points,
    );
    this.layoutGrid(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 80));
    this.setMapping(mapping);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setMapping(mapping: LedMapping): void {
    this.mappingRevision += 1;
    this.mapping = mapping;
    this.clearBoundaryPreview();
    this.clearWiringPreview();
    const positions = new Float32Array(mapping.entries.length * 3);
    const colors = new Float32Array(mapping.entries.length * 3);
    this.baseLedColors = new Float32Array(mapping.entries.length * 3);
    for (let physical = 0; physical < mapping.entries.length; physical += 1) {
      const entry = mapping.entries[physical];
      if (!entry) continue;
      const offset = physical * 3;
      positions[offset] = entry.x;
      positions[offset + 1] = entry.y;
      positions[offset + 2] = entry.z;
      colors[offset] = 0.04;
      colors[offset + 1] = 0.08;
      colors[offset + 2] = 0.12;
      this.baseLedColors[offset] = 0.04;
      this.baseLedColors[offset + 1] = 0.08;
      this.baseLedColors[offset + 2] = 0.12;
    }
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
    this.buildPanelDecorations(
      mapping.panels,
      mapping.surfaceFaces ?? [],
      mapping.mechanicalMounts ?? [],
      mapping.printableClosures ?? [],
    );
    this.surfacePlacement.setPanels(mapping.panels, this.panelThickness);
    this.applySelectionFocus();
    if (mapping.entries.length > 0 || mapping.panels.length > 0) {
      this.fitMapping();
    }
  }

  updateColors(pixels: Uint32Array, mode: DisplayMode): void {
    const attribute = this.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    for (
      let physical = 0;
      physical < this.mapping.entries.length;
      physical += 1
    ) {
      const entry = this.mapping.entries[physical];
      if (!entry) continue;
      if (mode === "wled") {
        const packed = pixels[entry.logicalIndex] ?? 0;
        this.color.setRGB(
          ((packed >> 16) & 0xff) / 255,
          ((packed >> 8) & 0xff) / 255,
          (packed & 0xff) / 255,
          THREE.SRGBColorSpace,
        );
      } else {
        const index =
          mode === "physical-index" ? entry.physicalIndex : entry.logicalIndex;
        const columns = this.mapping.panelPixelGrid?.columns ?? Math.max(
          1,
          Math.ceil(Math.sqrt(this.mapping.entries.length)),
        );
        const rows = this.mapping.panelPixelGrid?.rows ?? Math.max(
          1,
          Math.ceil(this.mapping.entries.length / columns),
        );
        const ledsPerPanel = columns * rows;
        const panelBand = Math.floor(index / ledsPerPanel);
        const hue =
          (panelBand * 0.137 +
            (index % ledsPerPanel) / (ledsPerPanel * columns)) % 1;
        const lightness = index % columns === 0 ? 0.78 : 0.52;
        this.color.setHSL(hue, 0.88, lightness);
      }
      const offset = physical * 3;
      this.baseLedColors[offset] = this.color.r;
      this.baseLedColors[offset + 1] = this.color.g;
      this.baseLedColors[offset + 2] = this.color.b;
      const display = selectionDisplayColor(
        this.color, entry.panelId, this.selectedPanelId,
      );
      attribute.setXYZ(physical, display.r, display.g, display.b);
    }
    attribute.needsUpdate = true;
  }

  render(): void {
    this.controls.update();
    this.cameraDirection
      .copy(this.camera.position)
      .sub(this.controls.target)
      .normalize();
    for (const label of this.panelLabels) {
      label.object.visible =
        this.panelLabelsVisible &&
        label.normal.dot(this.cameraDirection) > 0.08;
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  setPanelProfileThickness(thickness: number): void {
    this.panelThickness = thickness;
    this.surfacePlacement.setPanels(this.mapping.panels, thickness);
  }

  setEditorCapabilities(capabilities: EditorCapabilities): void {
    this.surfacePlacement.setCapabilities(capabilities);
  }

  setDesignSurface(
    geometry: THREE.BufferGeometry | null,
    attachmentSurface: "design-surface" | "mechanical-shell" = "design-surface",
  ): void {
    this.surfacePlacement.setSurface(geometry, attachmentSurface);
    const bounds = this.surfacePlacement.getSurfaceBounds();
    if (bounds) this.fitSphere(bounds);
  }

  setSurfaceEditorCallbacks(callbacks: {
    onSelectionChange?: (panelId: string | null) => void;
    onPlacementCommit?: (placement: SurfacePanelPlacement) => void;
    onLocalTranslationCommit?: (panelId: string, deltaX: number, deltaY: number) => void;
    onRotationCommit?: (panelId: string, degrees: number) => void;
    onAddPanelCommit?: (placement: SurfacePlacement) => void;
    onDeletePanelRequest?: (panelId: string) => void;
  }): void {
    this.surfacePlacement.onSelectionChange = (panelId) => {
      this.selectedPanelId = panelId;
      this.updatePanelLabelSelection();
      this.applySelectionFocus();
      callbacks.onSelectionChange?.(panelId);
    };
    this.surfacePlacement.onPlacementCommit = callbacks.onPlacementCommit;
    this.surfacePlacement.onLocalTranslationCommit = callbacks.onLocalTranslationCommit;
    this.surfacePlacement.onRotationCommit = callbacks.onRotationCommit;
    this.surfacePlacement.onAddPanelCommit = callbacks.onAddPanelCommit;
    this.surfacePlacement.onDeletePanelRequest = callbacks.onDeletePanelRequest;
  }

  selectEditorPanel(panelId: string | null): void {
    this.surfacePlacement.selectPanel(panelId);
  }

  setPanelLabelsVisible(visible: boolean): void {
    this.panelLabelsVisible = visible;
  }

  setWiringPreview(preview: WiringPreview): void {
    this.clearWiringPreview();
    if (preview.status === "unavailable") return;
    this.buildWiringPreview(preview);
    this.applySelectionFocus();
  }

  setShellTransparency(value: number): void {
    this.shellTransparency = THREE.MathUtils.clamp(value, 0, 0.9);
    this.applyShellTransparency();
  }

  setBoundaryPreview(boundary: ClosedPanelBoundary | null): void {
    this.clearBoundaryPreview();
    if (!boundary) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(boundary.vertices.flat(), 3),
    );
    geometry.setIndex(boundary.triangles.flat());
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x36e0d0,
        opacity: 0.24,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    surface.name = "panel-outline-boundary-surface";
    surface.renderOrder = 2;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({
        color: 0x8fffee,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
      }),
    );
    edges.name = "panel-outline-boundary-edges";
    edges.renderOrder = 3;
    this.boundaryPreviewLayer.add(surface, edges);
  }

  setExactGeneratedMechanics(
    boundary: ClosedPanelBoundary | null,
    assets?: VerifiedGeneratedMechanics,
  ): void {
    this.clearBoundaryPreview();
    this.disposeGroup(this.printableLayer);
    if (!boundary || !assets) return;

    const geometryFrom = (bytes: Uint8Array): THREE.BufferGeometry => {
      const copy = Uint8Array.from(bytes);
      const geometry = this.stlLoader.parse(copy.buffer);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    };
    const boundaryGeometry = geometryFrom(assets.boundary.bytes);
    const boundarySurface = new THREE.Mesh(
      boundaryGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x36e0d0,
        opacity: 0.16,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    boundarySurface.name = "exact-generated-boundary-stl";
    boundarySurface.userData.sha256 = assets.boundary.sha256;
    boundarySurface.userData.source = assets.boundary.source;
    const boundaryEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boundaryGeometry, 1),
      new THREE.LineBasicMaterial({
        color: 0x8fffee,
        transparent: true,
        opacity: 0.72,
      }),
    );
    this.boundaryPreviewLayer.add(boundarySurface, boundaryEdges);

    const caps = boundary.faces
      .filter((face) => face.role === "cap")
      .sort((left, right) => left.gapId!.localeCompare(right.gapId!));
    if (caps.length !== assets.parts.length) {
      throw new Error(
        `Generated manifest has ${assets.parts.length} parts for ${caps.length} validated caps.`,
      );
    }
    assets.parts.forEach((asset, index) => {
      const expectedId = `part-${String(index + 1).padStart(3, "0")}`;
      if (asset.id !== expectedId) {
        throw new Error(
          `Generated part order is invalid: expected ${expectedId}, received ${asset.id}.`,
        );
      }
      const cap = caps[index]!;
      const points = cap.vertexIndices.map((vertexIndex) => {
        const [x, y, z] = boundary.vertices[vertexIndex]!;
        return new THREE.Vector3(x, y, z);
      });
      const origin = points.reduce(
        (sum, point) => sum.add(point),
        new THREE.Vector3(),
      ).multiplyScalar(1 / points.length);
      const xAxis = points[1]!.clone().sub(points[0]!).normalize();
      const normal = new THREE.Vector3(...cap.normal).normalize();
      const yAxis = normal.clone().cross(xAxis).normalize();
      const inwardAxis = normal.clone().multiplyScalar(-1);
      const exact = new THREE.Mesh(
        geometryFrom(asset.bytes),
        this.markShellMaterial(new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? 0x2f939c : 0x287d89,
          side: THREE.DoubleSide,
        })),
      );
      exact.matrix.set(
        xAxis.x, yAxis.x, inwardAxis.x, origin.x,
        xAxis.y, yAxis.y, inwardAxis.y, origin.y,
        xAxis.z, yAxis.z, inwardAxis.z, origin.z,
        0, 0, 0, 1,
      );
      exact.matrixAutoUpdate = false;
      exact.renderOrder = 1;
      exact.name = `exact-generated-${asset.id}`;
      exact.userData.source = asset.source;
      exact.userData.sha256 = asset.sha256;
      exact.userData.exactReferencedStl = true;
      this.printableLayer.add(exact);
    });
    this.applySelectionFocus();
  }

  setPrintableLayerVisible(visible: boolean): void {
    this.printableLayer.visible = visible;
  }

  setConnectorLayerVisible(visible: boolean): void {
    this.connectorLayer.visible = visible;
  }

  setWiringLayerVisible(visible: boolean): void {
    this.wiringLayer.visible = visible;
  }

  setOutputVisible(outputIndex: number, visible: boolean): void {
    this.outputVisibility.set(outputIndex, visible);
    const connectorLayer = this.connectorOutputLayers.get(outputIndex);
    const wiringLayer = this.wiringOutputLayers.get(outputIndex);
    if (connectorLayer) connectorLayer.visible = visible;
    if (wiringLayer) wiringLayer.visible = visible;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.surfacePlacement.dispose();
    this.clearPanelDecorations();
    this.clearBoundaryPreview();
    this.disposeGroup(this.printableLayer);
    this.clearWiringPreview();
    this.geometry.dispose();
    this.ledTexture.dispose();
    this.material.dispose();
    this.disposeGrid();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  private markShellMaterial<T extends THREE.Material>(material: T): T {
    material.userData.shellMaterial = true;
    this.updateShellMaterial(material);
    return material;
  }

  private updateShellMaterial(material: THREE.Material): void {
    const opacity = 1 - this.shellTransparency;
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.98;
    material.needsUpdate = true;
  }

  private applyShellTransparency(): void {
    for (const layer of [this.panelLayer, this.printableLayer]) {
      layer.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (material.userData.shellMaterial) {
            this.updateShellMaterial(material);
          }
        }
      });
    }
  }

  private buildPanelDecorations(
    panels: PanelDefinition[],
    surfaceFaces: SculptureSurfaceFace[],
    mechanicalMounts: MechanicalMountPreview[],
    printableClosures: PrintableClosurePreview[],
  ): void {
    this.clearPanelDecorations();
    this.disposeGroup(this.printableLayer);
    if (panels.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const outlinePanelIds: Array<string | null> = [];
    const surfacePositions: number[] = [];
    const surfaceColors: number[] = [];
    const surfacePanelIds: Array<string | null> = [];
    const panelSurfacePositions: number[] = [];
    const panelSurfaceColors: number[] = [];
    const panelSurfaceIds: Array<string | null> = [];
    const mountPositions: number[] = [];
    const printableClosureIds = new Set(
      printableClosures.map((closure) => closure.id),
    );
    const edgePairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];

    for (const face of surfaceFaces) {
      if (face.role === "filler" && printableClosureIds.has(face.id)) continue;
      const surfaceColor = new THREE.Color(
        face.role === "panel" ? 0x071720 : 0x18252d,
      );
      const offset = this.toThree(face.normal).multiplyScalar(-0.12);
      for (let index = 1; index < face.vertices.length - 1; index += 1) {
        for (const vertex of [
          face.vertices[0]!,
          face.vertices[index]!,
          face.vertices[index + 1]!,
        ]) {
          const point = this.toThree(vertex).add(offset);
          surfacePositions.push(point.x, point.y, point.z);
          surfaceColors.push(surfaceColor.r, surfaceColor.g, surfaceColor.b);
          surfacePanelIds.push(null);
        }
      }
    }

    for (const mount of mechanicalMounts) {
      mountPositions.push(
        mount.edgeMidpoint.x,
        mount.edgeMidpoint.y,
        mount.edgeMidpoint.z,
        mount.holePosition.x,
        mount.holePosition.y,
        mount.holePosition.z,
      );
    }

    for (const panel of panels) {
      const surfaceCorners = this.panelCorners(panel, 0);
      const corners = this.panelCorners(panel, 0.35);
      const outlineColor = new THREE.Color(
        panel.faceType === "square-face" ? 0x39d9d0 : 0xff9d5c,
      );
      const surfaceColor = new THREE.Color(0x080a0c);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = surfaceCorners[cornerIndex]!;
        panelSurfacePositions.push(corner.x, corner.y, corner.z);
        panelSurfaceColors.push(
          surfaceColor.r,
          surfaceColor.g,
          surfaceColor.b,
        );
        panelSurfaceIds.push(panel.id);
      }
      for (const [start, end] of edgePairs) {
        const first = corners[start]!;
        const second = corners[end]!;
        positions.push(first.x, first.y, first.z, second.x, second.y, second.z);
        colors.push(
          outlineColor.r,
          outlineColor.g,
          outlineColor.b,
          outlineColor.r,
          outlineColor.g,
          outlineColor.b,
        );
        outlinePanelIds.push(panel.id, panel.id);
      }

      const element = document.createElement("span");
      element.className =
        panel.faceType === "square-face"
          ? "panel-label panel-label--square"
          : "panel-label panel-label--pentagon";
      element.textContent = panel.id;
      element.dataset.panelId = panel.id;
      element.title = `Select panel ${panel.id}`;
      element.setAttribute("role", "button");
      element.tabIndex = 0;
      const selectPanel = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.surfacePlacement.selectPanel(panel.id);
      };
      element.addEventListener("pointerdown", selectPanel);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectPanel(event);
      });
      const object = new CSS2DObject(element);
      const labelPosition = this.toThree(panel.position).addScaledVector(
        this.toThree(panel.normal),
        3,
      );
      object.position.copy(labelPosition);
      this.panelLayer.add(object);
      this.panelLabels.push({
        object,
        element,
        normal: this.toThree(panel.normal),
      });
      element.classList.toggle(
        "panel-label--selected",
        panel.id === this.selectedPanelId,
      );
      element.setAttribute(
        "aria-pressed",
        String(panel.id === this.selectedPanelId),
      );
    }

    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(surfacePositions, 3),
    );
    surfaceGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(surfaceColors, 3),
    );
    const surfaceMaterial = this.markShellMaterial(new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    }));
    const surfaces = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surfaces.userData.selectionFocusVertexColors = true;
    surfaces.userData.selectionFocusBaseColors =
      Float32Array.from(surfaceColors);
    surfaces.userData.selectionFocusPanelIds = surfacePanelIds;
    surfaces.renderOrder = 0;
    this.panelLayer.add(surfaces);

    const panelSurfaceGeometry = new THREE.BufferGeometry();
    panelSurfaceGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(panelSurfacePositions, 3),
    );
    panelSurfaceGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(panelSurfaceColors, 3),
    );
    panelSurfaceGeometry.computeVertexNormals();
    const panelSurfaceMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      specular: 0x9ab3c4,
      shininess: 92,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
    });
    const panelSurfaces = new THREE.Mesh(
      panelSurfaceGeometry,
      panelSurfaceMaterial,
    );
    panelSurfaces.name = "opaque-glossy-pcb-surfaces";
    panelSurfaces.userData.selectionFocusVertexColors = true;
    panelSurfaces.userData.selectionFocusBaseColors =
      Float32Array.from(panelSurfaceColors);
    panelSurfaces.userData.selectionFocusPanelIds = panelSurfaceIds;
    panelSurfaces.renderOrder = 0;
    this.panelLayer.add(panelSurfaces);
    this.buildPrintableClosures(printableClosures, surfaceFaces);

    if (mechanicalMounts.length > 0) {
      const mountGeometry = new THREE.BufferGeometry();
      mountGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(mountPositions, 3),
      );
      const mountLines = new THREE.LineSegments(
        mountGeometry,
        new THREE.LineBasicMaterial({ color: 0xffc857, toneMapped: false }),
      );
      mountLines.renderOrder = 3;
      this.panelLayer.add(mountLines);

      const holeMarkers = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1.65, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false }),
        mechanicalMounts.length,
      );
      const matrix = new THREE.Matrix4();
      mechanicalMounts.forEach((mount, index) => {
        matrix.makeTranslation(
          mount.holePosition.x,
          mount.holePosition.y,
          mount.holePosition.z,
        );
        holeMarkers.setMatrixAt(index, matrix);
      });
      holeMarkers.instanceMatrix.needsUpdate = true;
      holeMarkers.renderOrder = 3;
      this.panelLayer.add(holeMarkers);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const outlines = new THREE.LineSegments(geometry, material);
    outlines.userData.selectionFocusVertexColors = true;
    outlines.userData.selectionFocusBaseColors =
      Float32Array.from(colors);
    outlines.userData.selectionFocusPanelIds = outlinePanelIds;
    outlines.renderOrder = 1;
    this.panelLayer.add(outlines);
  }

  private buildPrintableClosures(
    closures: PrintableClosurePreview[],
    surfaceFaces: SculptureSurfaceFace[],
  ): void {
    if (closures.length === 0) return;
    const clippingPlanes = surfaceFaces.map((face) => {
      const normal = this.toThree(face.normal);
      return new THREE.Plane(
        normal,
        -normal.dot(this.toThree(face.vertices[0]!)),
      );
    });
    this.renderer.localClippingEnabled = true;
    const outward = new THREE.Vector3(0, 0, 1);
    const revision = this.mappingRevision;

    for (const closure of closures) {
      const closureGroup = new THREE.Group();
      closureGroup.name = "printable-" + closure.id;
      closureGroup.userData.cadMeshAsset = closure.cadMeshAsset;
      this.printableLayer.add(closureGroup);

      const coverMaterial = this.markShellMaterial(new THREE.MeshBasicMaterial({
        color: 0x247c87,
        side: THREE.DoubleSide,
        clippingPlanes,
      }));
      const connectorMaterial = this.markShellMaterial(new THREE.MeshBasicMaterial({
        color: 0x45a6ad,
        side: THREE.DoubleSide,
        clippingPlanes,
      }));
      const vertexCount = closure.vertices.length;
      const positions: number[] = [];
      const indices: number[] = [];
      for (const vertex of closure.vertices) {
        positions.push(vertex.x, vertex.y, vertex.z);
      }
      for (const vertex of closure.vertices) {
        const inner = this.toThree(vertex).addScaledVector(
          this.toThree(closure.normal),
          -closure.coverThickness,
        );
        positions.push(inner.x, inner.y, inner.z);
      }
      for (let index = 1; index < vertexCount - 1; index += 1) {
        indices.push(0, index, index + 1);
        indices.push(vertexCount, vertexCount + index + 1, vertexCount + index);
      }
      for (let index = 0; index < vertexCount; index += 1) {
        const next = (index + 1) % vertexCount;
        indices.push(index, next, vertexCount + next);
        indices.push(index, vertexCount + next, vertexCount + index);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const cover = new THREE.Mesh(geometry, coverMaterial);
      cover.renderOrder = 1;
      closureGroup.add(cover);

      for (const connector of closure.connectors) {
        const shape = new THREE.Shape();
        shape.absarc(
          0,
          0,
          connector.screwTabWidth / 2,
          0,
          Math.PI * 2,
          false,
        );
        const pilot = new THREE.Path();
        pilot.absarc(
          0,
          0,
          connector.pilotDiameter / 2,
          0,
          Math.PI * 2,
          true,
        );
        shape.holes.push(pilot);
        const tabGeometry = new THREE.ExtrudeGeometry(shape, {
          depth: connector.flangeThickness,
          bevelEnabled: false,
          curveSegments: 32,
        });
        const tab = new THREE.Mesh(tabGeometry, connectorMaterial);
        const inward = this.toThree(connector.panelInwardNormal).normalize();
        tab.quaternion.setFromUnitVectors(outward, inward);
        tab.position
          .copy(this.toThree(connector.pilotPosition))
          .addScaledVector(inward, connector.panelMountOffset);
        tab.renderOrder = 1;
        closureGroup.add(tab);
      }

      const assetUrl = new URL(
        closure.cadMeshAsset,
        document.baseURI,
      ).href;
      this.stlLoader.load(
        assetUrl,
        (stlGeometry) => {
          if (
            revision !== this.mappingRevision ||
            closureGroup.parent !== this.printableLayer
          ) {
            stlGeometry.dispose();
            return;
          }
          this.disposeGroup(closureGroup);
          stlGeometry.computeVertexNormals();
          const exactMaterial = this.markShellMaterial(new THREE.MeshBasicMaterial({
            color: 0x2f939c,
            side: THREE.DoubleSide,
          }));
          const exact = new THREE.Mesh(stlGeometry, exactMaterial);
          const origin = this.toThree(closure.frame.origin);
          const xAxis = this.toThree(closure.frame.xAxis);
          const yAxis = this.toThree(closure.frame.yAxis);
          const inwardAxis = this.toThree(closure.frame.inwardAxis);
          exact.matrix.set(
            xAxis.x,
            yAxis.x,
            inwardAxis.x,
            origin.x,
            xAxis.y,
            yAxis.y,
            inwardAxis.y,
            origin.y,
            xAxis.z,
            yAxis.z,
            inwardAxis.z,
            origin.z,
            0,
            0,
            0,
            1,
          );
          exact.matrixAutoUpdate = false;
          exact.renderOrder = 1;
          exact.userData.source = "generated-stl";
          closureGroup.userData.loaded = true;
          closureGroup.add(exact);
          this.applySelectionFocus();
        },
        undefined,
        () => {
          closureGroup.userData.loaded = false;
        },
      );
    }
  }

  private buildWiringPreview(preview: WiringPreview): void {
    const nodeByPanel = new Map(
      preview.nodes.map((node) => [node.panelId, node]),
    );
    const markerGeometry = new THREE.SphereGeometry(2.2, 14, 10);
    const dinMaterial = new THREE.MeshBasicMaterial({
      color: 0x52f28b,
      toneMapped: false,
    });
    const doutMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5c93,
      toneMapped: false,
    });
    const up = new THREE.Vector3(0, 1, 0);

    for (const output of preview.outputs) {
      const connectorGroup = new THREE.Group();
      const wiringGroup = new THREE.Group();
      connectorGroup.visible =
        this.outputVisibility.get(output.outputIndex) ?? true;
      wiringGroup.visible =
        this.outputVisibility.get(output.outputIndex) ?? true;
      this.connectorOutputLayers.set(output.outputIndex, connectorGroup);
      this.wiringOutputLayers.set(output.outputIndex, wiringGroup);
      this.connectorLayer.add(connectorGroup);
      this.wiringLayer.add(wiringGroup);

      const nodes = output.panelIds
        .map((panelId) => nodeByPanel.get(panelId))
        .filter((node) => node !== undefined);
      const dinMarkers = new THREE.InstancedMesh(
        markerGeometry,
        dinMaterial,
        nodes.length,
      );
      const doutMarkers = new THREE.InstancedMesh(
        markerGeometry,
        doutMaterial,
        nodes.length,
      );
      const matrix = new THREE.Matrix4();

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        const din = this.toThree(node.din);
        const dout = this.toThree(node.dout);
        matrix.makeTranslation(din.x, din.y, din.z);
        dinMarkers.setMatrixAt(index, matrix);
        matrix.makeTranslation(dout.x, dout.y, dout.z);
        doutMarkers.setMatrixAt(index, matrix);

        const panelDirection = dout.clone().sub(din);
        const panelLength = panelDirection.length();
        if (panelLength > 0) {
          const arrow = new THREE.ArrowHelper(
            panelDirection.normalize(),
            din,
            panelLength,
            output.color,
            3.2,
            2.2,
          );
          arrow.renderOrder = 3;
          connectorGroup.add(arrow);
        }
      }
      dinMarkers.instanceMatrix.needsUpdate = true;
      doutMarkers.instanceMatrix.needsUpdate = true;
      dinMarkers.renderOrder = 3;
      doutMarkers.renderOrder = 3;
      connectorGroup.add(dinMarkers, doutMarkers);

      for (let index = 0; index < nodes.length - 1; index += 1) {
        const current = nodes[index]!;
        const next = nodes[index + 1]!;
        const start = this.toThree(current.dout);
        const end = this.toThree(next.din);
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        const outward = midpoint.clone();
        if (outward.lengthSq() < 1e-8) outward.set(0, 1, 0);
        outward
          .normalize()
          .multiplyScalar(Math.max(start.length(), end.length()) + 16);
        const curve = new THREE.QuadraticBezierCurve3(start, outward, end);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 12, 0.72, 7, false),
          new THREE.MeshBasicMaterial({
            color: output.color,
            toneMapped: false,
          }),
        );
        tube.renderOrder = 2;
        wiringGroup.add(tube);

        const arrowPosition = curve.getPoint(0.78);
        const arrowDirection = curve
          .getTangent(0.78)
          .normalize();
        const arrowHead = new THREE.Mesh(
          new THREE.ConeGeometry(1.8, 4.5, 8),
          new THREE.MeshBasicMaterial({
            color: output.color,
            toneMapped: false,
          }),
        );
        arrowHead.position.copy(arrowPosition);
        arrowHead.quaternion.setFromUnitVectors(up, arrowDirection);
        arrowHead.renderOrder = 3;
        wiringGroup.add(arrowHead);
      }
    }
  }

  private clearBoundaryPreview(): void {
    this.disposeGroup(this.boundaryPreviewLayer);
  }

  private clearWiringPreview(): void {
    this.disposeGroup(this.connectorLayer);
    this.disposeGroup(this.wiringLayer);
    this.connectorOutputLayers.clear();
    this.wiringOutputLayers.clear();
  }

  private disposeGroup(group: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        geometries.add(object.geometry);
        if (Array.isArray(object.material)) {
          for (const material of object.material) materials.add(material);
        } else {
          materials.add(object.material);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    group.clear();
  }

  private applySelectionFocus(): void {
    this.applyLedSelectionFocus();
    this.updatePanelLabelSelection();
    for (const layer of [
      this.panelLayer,
      this.printableLayer,
      this.connectorLayer,
      this.wiringLayer,
    ]) {
      layer.traverse((object) => {
        if (object.userData.selectionFocusVertexColors) {
          this.applyVertexSelectionFocus(object);
          return;
        }
        if (
          !(object instanceof THREE.Mesh) &&
          !(object instanceof THREE.Line) &&
          !(object instanceof THREE.Points)
        ) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) this.applyMaterialSelectionFocus(material);
      });
    }
  }

  private applyLedSelectionFocus(): void {
    const attribute = this.geometry.getAttribute("color") as
      THREE.BufferAttribute | undefined;
    if (!attribute) return;
    for (let physical = 0; physical < this.mapping.entries.length; physical += 1) {
      const offset = physical * 3;
      const base = {
        r: this.baseLedColors[offset] ?? 0,
        g: this.baseLedColors[offset + 1] ?? 0,
        b: this.baseLedColors[offset + 2] ?? 0,
      };
      const entry = this.mapping.entries[physical]!;
      const display = selectionDisplayColor(
        base, entry.panelId, this.selectedPanelId,
      );
      attribute.setXYZ(physical, display.r, display.g, display.b);
    }
    attribute.needsUpdate = true;
  }

  private applyVertexSelectionFocus(object: THREE.Object3D): void {
    const renderable = object as THREE.Mesh | THREE.LineSegments;
    const attribute = renderable.geometry.getAttribute("color") as
      THREE.BufferAttribute;
    const base = object.userData.selectionFocusBaseColors as Float32Array;
    const panelIds = object.userData.selectionFocusPanelIds as
      Array<string | null>;
    for (let index = 0; index < attribute.count; index += 1) {
      const offset = index * 3;
      const color = { r: base[offset]!, g: base[offset + 1]!, b: base[offset + 2]! };
      const display = selectionDisplayColor(
        color, panelIds[index] ?? null, this.selectedPanelId,
      );
      attribute.setXYZ(index, display.r, display.g, display.b);
    }
    attribute.needsUpdate = true;
  }

  private applyMaterialSelectionFocus(material: THREE.Material): void {
    const colored = material as THREE.Material & { color?: THREE.Color };
    if (!colored.color) return;
    let base = material.userData.selectionFocusBaseColor as
      THREE.Color | undefined;
    if (!base) {
      base = colored.color.clone();
      material.userData.selectionFocusBaseColor = base;
    }
    if (!this.selectedPanelId) {
      colored.color.copy(base);
    } else {
      const grey = focusedGrey(base);
      colored.color.setRGB(grey.r, grey.g, grey.b);
    }
  }

  private updatePanelLabelSelection(): void {
    for (const label of this.panelLabels) {
      const isSelected =
        label.element.dataset.panelId === this.selectedPanelId;
      label.element.classList.toggle(
        "panel-label--selected",
        isSelected,
      );
      label.element.classList.toggle(
        "panel-label--unfocused",
        this.selectedPanelId !== null && !isSelected,
      );
      label.element.setAttribute(
        "aria-pressed",
        String(isSelected),
      );
    }
  }

  private clearPanelDecorations(): void {
    for (const label of this.panelLabels) label.element.remove();
    this.panelLabels.length = 0;
    for (const child of this.panelLayer.children) {
      if (child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const material of child.material) material.dispose();
        } else {
          child.material.dispose();
        }
      }
    }
    this.panelLayer.clear();
  }

  private panelCorners(
    panel: PanelDefinition,
    normalOffset: number,
  ): THREE.Vector3[] {
    const normal = this.toThree(panel.normal);
    const center = this.toThree(panel.position).addScaledVector(
      normal,
      normalOffset,
    );
    const halfX = this.toThree(panel.xAxis).multiplyScalar(
      panel.previewWidth / 2,
    );
    const halfY = this.toThree(panel.yAxis).multiplyScalar(
      panel.previewHeight / 2,
    );
    return [
      center.clone().sub(halfX).sub(halfY),
      center.clone().add(halfX).sub(halfY),
      center.clone().add(halfX).add(halfY),
      center.clone().sub(halfX).add(halfY),
    ];
  }

  private fitMapping(): void {
    if (this.mapping.entries.length === 0 && this.mapping.panels.length === 0) {
      const surface = this.surfacePlacement.getSurfaceBounds();
      this.fitSphere(surface ?? new THREE.Sphere(new THREE.Vector3(0, 0, 0), 80));
      return;
    }
    const bounds = this.geometry.boundingSphere;
    if (!bounds) return;
    this.fitSphere(bounds);
  }

  private disposeGrid(): void {
    if (!this.grid) return;
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    const material = this.grid.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
    this.grid = undefined;
  }

  private layoutGrid(bounds: THREE.Sphere): void {
    this.disposeGrid();
    const size = Math.max(200, Math.ceil((bounds.radius * 4) / 50) * 50);
    this.grid = new THREE.GridHelper(size, 20, 0x5aa7b4, 0x1e3a44);
    this.grid.position.set(
      bounds.center.x,
      bounds.center.y - bounds.radius,
      bounds.center.z,
    );
    this.grid.renderOrder = -2;
    this.scene.add(this.grid);
  }

  private fitSphere(bounds: THREE.Sphere): void {
    const radius = Math.max(bounds.radius, 1);
    const centre = bounds.center;
    const currentDirection = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const distance = (radius / Math.sin(halfFov)) * 1.12;

    this.controls.target.copy(centre);
    this.camera.position
      .copy(centre)
      .addScaledVector(currentDirection, distance);
    this.controls.minDistance = radius * 1.15;
    this.controls.maxDistance = radius * 5;
    this.camera.near = Math.max(0.1, radius / 500);
    this.camera.far = distance + radius * 6;
    this.camera.updateProjectionMatrix();
    this.layoutGrid(new THREE.Sphere(centre.clone(), radius));
    this.controls.update();
  }

  private toThree(value: Vector3Data): THREE.Vector3 {
    return new THREE.Vector3(value.x, value.y, value.z);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
  }
}
