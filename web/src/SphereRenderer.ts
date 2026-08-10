import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LedMapping, PanelDefinition, Vector3Data } from "./LedMapping";
import type { WiringPreview } from "./WiringPreview";

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
  private readonly occlusionCore = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x050a12 }),
  );
  private readonly color = new THREE.Color();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private mapping: LedMapping;
  private panelLabelsVisible = true;

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

    this.points.renderOrder = 4;
    this.scene.add(
      this.occlusionCore,
      this.panelLayer,
      this.wiringLayer,
      this.connectorLayer,
      this.points,
    );
    this.setMapping(mapping);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setMapping(mapping: LedMapping): void {
    this.mapping = mapping;
    this.clearWiringPreview();
    const positions = new Float32Array(mapping.entries.length * 3);
    const colors = new Float32Array(mapping.entries.length * 3);
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
    }
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
    this.buildPanelDecorations(mapping.panels);
    this.fitMapping();
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
        const panelBand = Math.floor(index / 64);
        const hue = (panelBand * 0.137 + (index % 64) / 512) % 1;
        const lightness = index % 8 === 0 ? 0.78 : 0.52;
        this.color.setHSL(hue, 0.88, lightness);
      }
      attribute.setXYZ(physical, this.color.r, this.color.g, this.color.b);
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

  setPanelLabelsVisible(visible: boolean): void {
    this.panelLabelsVisible = visible;
  }

  setWiringPreview(preview: WiringPreview): void {
    this.clearWiringPreview();
    if (preview.status !== "generated-provisional") return;
    this.buildWiringPreview(preview);
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
    this.clearPanelDecorations();
    this.clearWiringPreview();
    this.geometry.dispose();
    this.ledTexture.dispose();
    this.material.dispose();
    this.occlusionCore.geometry.dispose();
    if (Array.isArray(this.occlusionCore.material)) {
      for (const material of this.occlusionCore.material) material.dispose();
    } else {
      this.occlusionCore.material.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  private buildPanelDecorations(panels: PanelDefinition[]): void {
    this.clearPanelDecorations();
    if (panels.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const surfacePositions: number[] = [];
    const surfaceColors: number[] = [];
    const edgePairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];

    for (const panel of panels) {
      const surfaceCorners = this.panelCorners(panel, 0);
      const corners = this.panelCorners(panel, 0.35);
      const outlineColor = new THREE.Color(
        panel.faceType === "square-face" ? 0x39d9d0 : 0xff9d5c,
      );
      const surfaceColor = new THREE.Color(
        panel.faceType === "square-face" ? 0x071720 : 0x21120d,
      );
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = surfaceCorners[cornerIndex]!;
        surfacePositions.push(corner.x, corner.y, corner.z);
        surfaceColors.push(
          surfaceColor.r,
          surfaceColor.g,
          surfaceColor.b,
        );
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
      }

      const element = document.createElement("span");
      element.className =
        panel.faceType === "square-face"
          ? "panel-label panel-label--square"
          : "panel-label panel-label--pentagon";
      element.textContent = panel.id;
      element.title =
        panel.faceType === "square-face"
          ? "Square-face panel"
          : "Pentagon-centre panel";
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
    const surfaceMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });
    const surfaces = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surfaces.renderOrder = 0;
    this.panelLayer.add(surfaces);

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
    outlines.renderOrder = 1;
    this.panelLayer.add(outlines);
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
    const bounds = this.geometry.boundingSphere;
    if (!bounds) return;
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

    const panelDepths = this.mapping.panels.map((panel) =>
      Math.abs(
        panel.position.x * panel.normal.x +
          panel.position.y * panel.normal.y +
          panel.position.z * panel.normal.z,
      ),
    );
    const coreRadius =
      panelDepths.length > 0
        ? Math.min(...panelDepths) * 0.8
        : radius * 0.82;
    this.occlusionCore.position.set(0, 0, 0);
    this.occlusionCore.scale.setScalar(coreRadius);
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
