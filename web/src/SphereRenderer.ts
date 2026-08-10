import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LedMapping, PanelDefinition, Vector3Data } from "./LedMapping";

export type DisplayMode = "wled" | "physical-index" | "logical-index";

interface PanelLabel {
  object: CSS2DObject;
  element: HTMLSpanElement;
  normal: THREE.Vector3;
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
  private readonly panelLabels: PanelLabel[] = [];
  private readonly controls: OrbitControls;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.PointsMaterial({
    size: 3.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  private readonly points = new THREE.Points(this.geometry, this.material);
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

    this.scene.add(new THREE.AmbientLight(0x91a4c2, 0.7));
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(98.5, 5),
      new THREE.MeshBasicMaterial({
        color: 0x08111d,
        transparent: true,
        opacity: 0.82,
        side: THREE.BackSide,
      }),
    );
    this.scene.add(shell);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(108, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0f5f77,
        transparent: true,
        opacity: 0.045,
        side: THREE.BackSide,
      }),
    );
    this.scene.add(halo, this.panelLayer, this.points);
    this.setMapping(mapping);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setMapping(mapping: LedMapping): void {
    this.mapping = mapping;
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
    this.cameraDirection.copy(this.camera.position).normalize();
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

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearPanelDecorations();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  private buildPanelDecorations(panels: PanelDefinition[]): void {
    this.clearPanelDecorations();
    if (panels.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const edgePairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];

    for (const panel of panels) {
      const corners = this.panelCorners(panel);
      const outlineColor = new THREE.Color(
        panel.faceType === "square-face" ? 0x39d9d0 : 0xff9d5c,
      );
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

  private clearPanelDecorations(): void {
    for (const label of this.panelLabels) label.element.remove();
    this.panelLabels.length = 0;
    for (const child of this.panelLayer.children) {
      if (child instanceof THREE.LineSegments) {
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

  private panelCorners(panel: PanelDefinition): THREE.Vector3[] {
    const normal = this.toThree(panel.normal);
    const center = this.toThree(panel.position).addScaledVector(normal, 1.2);
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
