import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PanelDefinition } from "./LedMapping.ts";
import {
  createSurfaceOrientation,
  type SurfaceAttachment,
  type Vector3Tuple,
} from "../../src/sculpture/DesignSurface.ts";

export interface SurfacePlacement {
  position: Vector3Tuple;
  orientation: {
    xAxis: Vector3Tuple;
    yAxis: Vector3Tuple;
    normal: Vector3Tuple;
  };
  attachment: SurfaceAttachment;
}

export interface SurfacePanelPlacement extends SurfacePlacement {
  panelId: string;
}

function tuple(value: THREE.Vector3): Vector3Tuple {
  return [value.x, value.y, value.z];
}

export class SurfacePlacementController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly layer = new THREE.Group();
  private readonly panelTargets = new Map<string, THREE.Mesh>();
  private surface: THREE.Mesh | null = null;
  private selectedPanelId: string | null = null;
  private draggingPanelId: string | null = null;
  private pendingPlacement: SurfacePanelPlacement | null = null;
  private enabled = false;
  private addingPanel = false;
  private normalOffset = 0.4;

  onSelectionChange?: (panelId: string | null) => void;
  onPlacementCommit?: (placement: SurfacePanelPlacement) => void;
  onAddPanelCommit?: (placement: SurfacePlacement) => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly domElement: HTMLElement,
    private readonly controls: OrbitControls,
  ) {
    this.layer.name = "surface-placement-editor";
    this.scene.add(this.layer);
    domElement.addEventListener("pointerdown", this.pointerDown);
    domElement.addEventListener("pointermove", this.pointerMove);
    domElement.addEventListener("pointerup", this.pointerUp);
    domElement.addEventListener("pointercancel", this.pointerUp);
  }

  setSurface(geometry: THREE.BufferGeometry | null): void {
    if (this.surface) {
      this.layer.remove(this.surface);
      this.surface.geometry.dispose();
      const material = this.surface.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    this.surface = null;
    this.enabled = geometry !== null;
    if (!this.enabled) this.addingPanel = false;
    if (!geometry) {
      this.select(null);
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: 0x376478,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.surface = new THREE.Mesh(geometry, material);
    this.surface.name = "design-surface";
    this.surface.renderOrder = -1;
    this.layer.add(this.surface);
  }

  setPanels(panels: PanelDefinition[], thickness: number): void {
    this.normalOffset = thickness / 2;
    for (const target of this.panelTargets.values()) {
      this.layer.remove(target);
      target.geometry.dispose();
      const material = target.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    this.panelTargets.clear();
    for (const panel of panels) {
      const geometry = new THREE.BoxGeometry(
        panel.previewWidth,
        panel.previewHeight,
        Math.max(thickness, 1.2),
      );
      const material = new THREE.MeshBasicMaterial({
        color: 0x6ef8ee,
        transparent: true,
        opacity: 0.025,
        depthWrite: false,
      });
      const target = new THREE.Mesh(geometry, material);
      target.name = `surface-editor-panel-${panel.id}`;
      target.userData.panelId = panel.id;
      this.applyPanelTransform(target, panel);
      target.renderOrder = 8;
      this.panelTargets.set(panel.id, target);
      this.layer.add(target);
    }
    if (this.selectedPanelId && !this.panelTargets.has(this.selectedPanelId)) {
      this.select(null);
    } else {
      this.updateHighlight();
    }
  }

  getSurfaceBounds(): THREE.Sphere | null {
    if (!this.surface) return null;
    this.surface.geometry.computeBoundingSphere();
    return this.surface.geometry.boundingSphere?.clone() ?? null;
  }

  setAddPanelMode(enabled: boolean): void {
    this.addingPanel = enabled && this.enabled;
    if (this.addingPanel) this.select(null);
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.domElement.removeEventListener("pointermove", this.pointerMove);
    this.domElement.removeEventListener("pointerup", this.pointerUp);
    this.domElement.removeEventListener("pointercancel", this.pointerUp);
    this.setSurface(null);
    this.setPanels([], 0.8);
    this.scene.remove(this.layer);
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.addingPanel && this.surface) {
      const surfaceHit = this.raycaster.intersectObject(this.surface, false)[0];
      if (!surfaceHit || surfaceHit.faceIndex == null) return;
      const normal = this.interpolatedNormal(surfaceHit).normalize();
      const orientation = createSurfaceOrientation(tuple(normal));
      const position = surfaceHit.point.clone().addScaledVector(
        normal,
        this.normalOffset,
      );
      this.addingPanel = false;
      this.onAddPanelCommit?.({
        position: tuple(position),
        orientation,
        attachment: {
          triangleIndex: surfaceHit.faceIndex,
          barycentric: tuple(this.barycentric(surfaceHit)),
          normalOffset: this.normalOffset,
        },
      });
      return;
    }
    const hit = this.raycaster.intersectObjects(
      [...this.panelTargets.values()],
      false,
    )[0];
    const panelId = hit?.object.userData.panelId as string | undefined;
    if (!panelId) {
      this.select(null);
      return;
    }
    this.select(panelId);
    this.draggingPanelId = panelId;
    this.pendingPlacement = null;
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
    this.moveSelectedPanel(event);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.draggingPanelId) return;
    this.moveSelectedPanel(event);
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (!this.draggingPanelId) return;
    this.moveSelectedPanel(event);
    this.draggingPanelId = null;
    this.controls.enabled = true;
    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }
    if (this.pendingPlacement) {
      this.onPlacementCommit?.(this.pendingPlacement);
      this.pendingPlacement = null;
    }
  };

  private moveSelectedPanel(event: PointerEvent): void {
    if (!this.surface || !this.draggingPanelId) return;
    const target = this.panelTargets.get(this.draggingPanelId);
    if (!target) return;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.surface, false)[0];
    if (!hit || hit.faceIndex == null) return;
    const faceIndex = hit.faceIndex;
    const normal = this.interpolatedNormal(hit).normalize();
    const oldXAxis = new THREE.Vector3().setFromMatrixColumn(target.matrix, 0);
    let xAxis = oldXAxis.addScaledVector(normal, -oldXAxis.dot(normal));
    if (xAxis.lengthSq() < 1e-8) {
      xAxis = new THREE.Vector3(0, 1, 0).cross(normal);
      if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0).cross(normal);
    }
    xAxis.normalize();
    const yAxis = normal.clone().cross(xAxis).normalize();
    const position = hit.point.clone().addScaledVector(normal, this.normalOffset);
    target.matrix.set(
      xAxis.x, yAxis.x, normal.x, position.x,
      xAxis.y, yAxis.y, normal.y, position.y,
      xAxis.z, yAxis.z, normal.z, position.z,
      0, 0, 0, 1,
    );
    target.matrixAutoUpdate = false;
    const barycentric = this.barycentric(hit);
    this.pendingPlacement = {
      panelId: this.draggingPanelId,
      position: tuple(position),
      orientation: {
        xAxis: tuple(xAxis),
        yAxis: tuple(yAxis),
        normal: tuple(normal),
      },
      attachment: {
        triangleIndex: faceIndex,
        barycentric: tuple(barycentric),
        normalOffset: this.normalOffset,
      },
    };
  }

  private interpolatedNormal(hit: THREE.Intersection): THREE.Vector3 {
    const geometry = this.surface!.geometry;
    const normalAttribute = geometry.getAttribute("normal");
    const indices = geometry.index;
    if (!indices || !normalAttribute || hit.faceIndex == null) {
      return hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
    }
    const offset = hit.faceIndex * 3;
    const barycentric = this.barycentric(hit);
    const result = new THREE.Vector3();
    for (let vertex = 0; vertex < 3; vertex += 1) {
      result.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(
          normalAttribute,
          indices.getX(offset + vertex),
        ),
        barycentric.getComponent(vertex),
      );
    }
    return result;
  }

  private barycentric(hit: THREE.Intersection): THREE.Vector3 {
    const geometry = this.surface!.geometry;
    const positions = geometry.getAttribute("position");
    const indices = geometry.index;
    const offset = hit.faceIndex! * 3;
    const triangle = new THREE.Triangle(
      new THREE.Vector3().fromBufferAttribute(
        positions,
        indices ? indices.getX(offset) : offset,
      ),
      new THREE.Vector3().fromBufferAttribute(
        positions,
        indices ? indices.getX(offset + 1) : offset + 1,
      ),
      new THREE.Vector3().fromBufferAttribute(
        positions,
        indices ? indices.getX(offset + 2) : offset + 2,
      ),
    );
    const result = triangle.getBarycoord(hit.point, new THREE.Vector3());
    if (!result) throw new Error("Cannot attach a panel to a degenerate triangle.");
    return result;
  }

  private select(panelId: string | null): void {
    this.selectedPanelId = panelId;
    this.updateHighlight();
    this.onSelectionChange?.(panelId);
  }

  private updateHighlight(): void {
    for (const [panelId, target] of this.panelTargets) {
      const material = target.material as THREE.MeshBasicMaterial;
      material.opacity = panelId === this.selectedPanelId ? 0.3 : 0.025;
      material.color.set(panelId === this.selectedPanelId ? 0xffb35c : 0x6ef8ee);
    }
  }

  private applyPanelTransform(target: THREE.Object3D, panel: PanelDefinition): void {
    const x = panel.xAxis;
    const y = panel.yAxis;
    const z = panel.normal;
    const p = panel.position;
    target.matrix.set(
      x.x, y.x, z.x, p.x,
      x.y, y.y, z.y, p.y,
      x.z, y.z, z.z, p.z,
      0, 0, 0, 1,
    );
    target.matrixAutoUpdate = false;
  }

  private updatePointer(event: PointerEvent): void {
    const bounds = this.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
  }
}
