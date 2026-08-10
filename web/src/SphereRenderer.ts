import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LedMapping } from "./LedMapping";

export type DisplayMode = "wled" | "physical-index" | "logical-index";

export class SphereRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
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
  private readonly resizeObserver: ResizeObserver;
  private mapping: LedMapping;

  constructor(private readonly container: HTMLElement, mapping: LedMapping) {
    this.mapping = mapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.container.append(this.renderer.domElement);

    this.camera.position.set(0, 30, 285);
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
    this.scene.add(halo, this.points);
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
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
  }

  updateColors(pixels: Uint32Array, mode: DisplayMode): void {
    const attribute = this.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let physical = 0; physical < this.mapping.entries.length; physical += 1) {
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
        const index = mode === "physical-index" ? entry.physicalIndex : entry.logicalIndex;
        const panelBand = Math.floor(index / 64);
        const hue = ((panelBand * 0.137) + (index % 64) / 512) % 1;
        const lightness = index % 8 === 0 ? 0.78 : 0.52;
        this.color.setHSL(hue, 0.88, lightness);
      }
      attribute.setXYZ(physical, this.color.r, this.color.g, this.color.b);
    }
    attribute.needsUpdate = true;
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
