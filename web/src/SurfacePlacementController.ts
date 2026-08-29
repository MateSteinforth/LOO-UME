import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { PanelDefinition } from "./LedMapping.ts";
import type { EditorCapabilities } from "./EditorCapabilities.ts";
import {
  createMechanicalSurfaceOrientation,
  createSurfaceOrientation,
  type SurfaceAttachment,
  type Vector3Tuple,
} from "../../src/sculpture/DesignSurface.ts";
import { projectPanelOrientationOntoSurface } from "../../src/sculpture/SculptureEditor.ts";
import {
  focusedGrey,
  isBackgroundClick,
  type BackgroundPointerCandidate,
} from "./SelectionFocus.ts";

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

export interface FreePanelTransform {
  panelId: string;
  position: Vector3Tuple;
  orientation: {
    xAxis: Vector3Tuple;
    yAxis: Vector3Tuple;
    normal: Vector3Tuple;
  };
}

export type FreeControllerTransform = Omit<FreePanelTransform, "panelId">;

export type PanelTransformMode = "surface" | "free-3d";

function tuple(value: THREE.Vector3): Vector3Tuple {
  return [value.x, value.y, value.z];
}

function freeObjectTransformFromObject(
  object: THREE.Object3D,
): FreeControllerTransform {
  object.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  return {
    position: tuple(position),
    orientation: {
      xAxis: tuple(xAxis),
      yAxis: tuple(yAxis),
      normal: tuple(normal),
    },
  };
}

export function freePanelTransformFromObject(
  panelId: string,
  object: THREE.Object3D,
): FreePanelTransform {
  return { panelId, ...freeObjectTransformFromObject(object) };
}

export function freeControllerTransformFromObject(
  object: THREE.Object3D,
): FreeControllerTransform {
  return freeObjectTransformFromObject(object);
}

export function isObjectEffectivelyVisible(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export function nearestEditorTarget(
  controllerHit: Pick<THREE.Intersection, "distance"> | undefined,
  panelHit: Pick<THREE.Intersection, "distance"> | undefined,
): "controller" | "panel" | null {
  if (!controllerHit) return panelHit ? "panel" : null;
  if (!panelHit) return "controller";
  return controllerHit.distance <= panelHit.distance ? "controller" : "panel";
}

function freeTransformsDiffer(
  first: FreeControllerTransform,
  second: FreeControllerTransform,
): boolean {
  const values = (transform: FreeControllerTransform): number[] => [
    ...transform.position,
    ...transform.orientation.xAxis,
    ...transform.orientation.yAxis,
    ...transform.orientation.normal,
  ];
  return values(first).some((value, index) =>
    Math.abs(value - values(second)[index]!) > 1e-8
  );
}

interface CancelableTransformControl {
  dragging: boolean;
  reset(): void;
  pointerUp(pointer: PointerEvent | null): void;
}

interface ReconnectableTransformControl {
  disconnect(): void;
  connect(element: HTMLElement): void;
}

export function cancelFreePanelTransform(
  controls: CancelableTransformControl,
): boolean {
  if (!controls.dragging) return false;
  controls.reset();
  controls.pointerUp(null);
  return true;
}

export function reconnectFreePanelTransformControls(
  controls: readonly ReconnectableTransformControl[],
  domElement: HTMLElement,
): void {
  for (const control of controls) control.disconnect();
  for (const control of controls) control.connect(domElement);
}


export function intersectPanelPlane(
  ray: THREE.Ray,
  center: THREE.Vector3,
  normal: THREE.Vector3,
): THREE.Vector3 | null {
  return ray.intersectPlane(
    new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
    new THREE.Vector3(),
  );
}

export interface PanelPlaneDrag {
  center: THREE.Vector3;
  offset: THREE.Vector3;
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

export function beginPanelPlaneDrag(
  ray: THREE.Ray, center: THREE.Vector3, xAxis: THREE.Vector3,
  yAxis: THREE.Vector3, normal: THREE.Vector3,
): PanelPlaneDrag | null {
  const point = intersectPanelPlane(ray, center, normal);
  if (!point) return null;
  return {
    center: center.clone(),
    xAxis: xAxis.clone().normalize(),
    yAxis: yAxis.clone().normalize(),
    normal: normal.clone().normalize(),
    offset: point.clone().sub(center),
  };
}

export function updatePanelPlaneDrag(
  ray: THREE.Ray, drag: PanelPlaneDrag,
): { position: THREE.Vector3; deltaX: number; deltaY: number } | null {
  const point = intersectPanelPlane(ray, drag.center, drag.normal);
  if (!point) return null;
  const position = point.sub(drag.offset);
  const delta = position.clone().sub(drag.center);
  return {
    position,
    deltaX: delta.dot(drag.xAxis),
    deltaY: delta.dot(drag.yAxis),
  };
}

export class SurfacePlacementController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly layer = new THREE.Group();
  private readonly gizmo = new THREE.Group();
  private readonly translateControls: TransformControls;
  private readonly rotateControls: TransformControls;
  private readonly translateHelper: THREE.Object3D;
  private readonly rotateHelper: THREE.Object3D;
  private readonly translateHandles: THREE.Object3D[] = [];
  private readonly rotateHandles: THREE.Object3D[] = [];
  private readonly panelTargets = new Map<string, THREE.Mesh>();
  private controllerTarget: THREE.Object3D | null = null;
  private controllerLayerVisible = true;
  private controllerSelected = false;
  private surface: THREE.Mesh | null = null;
  private selectedPanelId: string | null = null;
  private draggingPanelId: string | null = null;
  private rotatingPanelId: string | null = null;
  private selectingPointerId: number | null = null;
  private surfacePointerCandidate: BackgroundPointerCandidate | null = null;
  private backgroundPointerCandidate: BackgroundPointerCandidate | null = null;
  private pendingRotationDegrees = 0;
  private rotationStartDirection = new THREE.Vector3();
  private rotationStartXAxis = new THREE.Vector3();
  private rotationStartYAxis = new THREE.Vector3();
  private pendingPlacement: SurfacePanelPlacement | null = null;
  private pendingLocalDelta: { deltaX: number; deltaY: number } | null = null;
  private planarDrag: PanelPlaneDrag | null = null;
  private capabilities: EditorCapabilities = {
    canSelectPanels: true,
    canRotateSelectedPanel: true,
    canDeleteSelectedPanel: true,
    canTranslateOnActiveSurface: true,
    canTranslateInPanelPlane: true,
    canCreateOnActiveSurface: true,
    canAutomaticallySeed: true,
    canExportMappingAndWiring: true,
    canGenerateGenericMechanics: true,
    canGenerateStructuralMechanics: true,
  };
  private attachmentSurface: "design-surface" | "mechanical-shell" =
    "design-surface";
  private normalOffset = 0.4;
  private transformStart: FreeControllerTransform | null = null;
  private activeTransformControls: TransformControls | null = null;
  private transformMode: PanelTransformMode = "surface";
  private interactionEnabled = true;

  onSelectionChange?: (panelId: string | null) => void;
  onControllerSelectionChange?: (selected: boolean) => void;
  onPlacementCommit?: (placement: SurfacePanelPlacement) => void;
  onLocalTranslationCommit?: (panelId: string, deltaX: number, deltaY: number) => void;
  onAddPanelCommit?: (placement: SurfacePlacement) => void;
  onRotationCommit?: (panelId: string, degrees: number) => void;
  onFreeTransformCommit?: (transform: FreePanelTransform) => void;
  onControllerTransformCommit?: (transform: FreeControllerTransform) => void;

  onDeletePanelRequest?: (panelId: string) => void;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly domElement: HTMLElement,
    private readonly controls: OrbitControls,
  ) {
    this.translateControls = new TransformControls(camera, domElement);
    this.translateControls.setMode("translate");
    this.translateControls.setSpace("local");
    this.translateControls.setSize(0.72);
    this.translateHelper = this.translateControls.getHelper();
    this.translateHelper.name = "selected-panel-local-translation-gizmo";
    this.scene.add(this.translateHelper);
    this.rotateControls = new TransformControls(camera, domElement);
    this.rotateControls.setMode("rotate");
    this.rotateControls.setSpace("local");
    this.rotateControls.setSize(1.02);
    this.rotateHelper = this.rotateControls.getHelper();
    this.rotateHelper.name = "selected-panel-local-rotation-gizmo";
    this.scene.add(this.rotateHelper);
    this.translateControls.addEventListener("mouseDown", this.translateMouseDown);
    this.translateControls.addEventListener("objectChange", this.transformObjectChange);
    this.translateControls.addEventListener("mouseUp", this.translateMouseUp);
    this.rotateControls.addEventListener("mouseDown", this.rotateMouseDown);
    this.rotateControls.addEventListener("objectChange", this.transformObjectChange);
    this.rotateControls.addEventListener("mouseUp", this.rotateMouseUp);
    this.layer.name = "surface-placement-editor";
    this.scene.add(this.layer);
    this.gizmo.name = "selected-panel-gizmo";
    this.layer.add(this.gizmo);
    this.connectPointerListeners();
  }

  setCapabilities(capabilities: EditorCapabilities): void {
    this.capabilities = capabilities;
    if (!capabilities.canSelectPanels) this.select(null);
    else this.updateGizmo();
  }

  setTransformMode(mode: PanelTransformMode): void {
    if (mode === this.transformMode) return;
    this.transformMode = mode;
    this.updateGizmo();
  }

  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
    this.layer.visible = enabled;
    this.updateGizmo();
  }

  setSurface(
    geometry: THREE.BufferGeometry | null,
    attachmentSurface: "design-surface" | "mechanical-shell" = "design-surface",
  ): void {
    if (this.surface) {
      this.surface.traverse((object) => {
        if (!(object instanceof THREE.Mesh) &&
          !(object instanceof THREE.LineSegments)) return;
        if (object !== this.surface) object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      });
      this.layer.remove(this.surface);
      this.surface.geometry.dispose();
    }
    this.surface = null;
    this.attachmentSurface = attachmentSurface;
    if (!geometry) return;
    const material = new THREE.MeshBasicMaterial({
      color: 0x376478,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.surface = new THREE.Mesh(geometry, material);
    this.surface.name = "design-surface";
    this.surface.renderOrder = -1;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 15),
      new THREE.LineBasicMaterial({
        color: 0x9af4ff,
        transparent: true,
        opacity: 0.9,
      }),
    );
    edges.renderOrder = 0;
    this.surface.add(edges);
    this.layer.add(this.surface);
    this.applySelectionFocus();
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
    this.updateGizmo();
  }

  setControllerTarget(target: THREE.Object3D | null): void {
    if (this.controllerTarget === target) return;
    if (this.controllerSelected) this.select(null);
    this.controllerTarget = target;
    this.updateGizmo();
  }

  setControllerLayerVisible(visible: boolean): void {
    this.controllerLayerVisible = visible;
    if (!visible && this.controllerSelected) this.select(null);
    else this.updateGizmo();
  }

  getSurfaceBounds(): THREE.Sphere | null {
    if (!this.surface) return null;
    this.surface.geometry.computeBoundingSphere();
    return this.surface.geometry.boundingSphere?.clone() ?? null;
  }

  selectPanel(panelId: string | null): void {
    if (!this.interactionEnabled) return;
    if (panelId !== null &&
      (!this.capabilities.canSelectPanels || !this.panelTargets.has(panelId))) return;
    this.select(panelId);
  }

  selectController(): void {
    if (!this.interactionEnabled || !this.controllerTarget) return;
    this.select(null, true);
  }

  dispose(): void {
    this.disconnectPointerListeners();
    this.setSurface(null);
    this.setPanels([], 0.8);
    this.setControllerTarget(null);
    this.translateControls.removeEventListener("mouseDown", this.translateMouseDown);
    this.translateControls.removeEventListener("objectChange", this.transformObjectChange);
    this.translateControls.removeEventListener("mouseUp", this.translateMouseUp);
    this.rotateControls.removeEventListener("mouseDown", this.rotateMouseDown);
    this.rotateControls.removeEventListener("objectChange", this.transformObjectChange);
    this.rotateControls.removeEventListener("mouseUp", this.rotateMouseUp);
    this.disposeGizmo();
    this.translateControls.detach();
    this.translateControls.dispose();
    this.rotateControls.detach();
    this.rotateControls.dispose();
    this.scene.remove(this.translateHelper);
    this.scene.remove(this.rotateHelper);
    this.scene.remove(this.layer);
  }

  private readonly translateMouseDown = (): void => {
    this.beginFreeTransform(this.translateControls);
  };

  private readonly rotateMouseDown = (): void => {
    this.beginFreeTransform(this.rotateControls);
  };

  private beginFreeTransform(control: TransformControls): void {
    if (this.activeTransformControls) return;
    const target = this.selectedTransformTarget();
    if (!target) return;
    this.activeTransformControls = control;
    this.transformStart = freeControllerTransformFromObject(target);
    this.translateControls.enabled = control === this.translateControls;
    this.rotateControls.enabled = control === this.rotateControls;
    this.controls.enabled = false;
  }

  private readonly transformObjectChange = (): void => {
    const target = this.selectedTransformTarget();
    if (!target) return;
    target.updateMatrix();
    if (!this.controllerSelected) {
      this.gizmo.matrix.copy(target.matrix);
      this.gizmo.updateMatrixWorld(true);
    }
  };

  private readonly translateMouseUp = (): void => {
    this.endFreeTransform(this.translateControls);
  };

  private readonly rotateMouseUp = (): void => {
    this.endFreeTransform(this.rotateControls);
  };

  private endFreeTransform(control: TransformControls): void {
    if (this.activeTransformControls !== control) return;
    this.activeTransformControls = null;
    this.controls.enabled = true;
    this.updateTransformControlAvailability();
    const start = this.transformStart;
    this.transformStart = null;
    if (!start) return;
    const target = this.selectedTransformTarget();
    if (!target) return;
    const transform = freeControllerTransformFromObject(target);
    if (!freeTransformsDiffer(start, transform)) return;
    if (this.controllerSelected) {
      this.onControllerTransformCommit?.(transform);
    } else if (this.selectedPanelId) {
      this.onFreeTransformCommit?.({ panelId: this.selectedPanelId, ...transform });
    }
  }

  private selectedTransformTarget(): THREE.Object3D | null {
    if (this.controllerSelected) return this.controllerTarget;
    return this.selectedPanelId
      ? this.panelTargets.get(this.selectedPanelId) ?? null
      : null;
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.interactionEnabled) return;
    if (event.button !== 0) return;
    if (this.translateControls.axis !== null || this.rotateControls.axis !== null ||
      this.translateControls.dragging || this.rotateControls.dragging) return;
    this.backgroundPointerCandidate = null;
    this.surfacePointerCandidate = null;
    this.updateRaycaster(event);
    if (this.capabilities.canRotateSelectedPanel && this.intersects(this.rotateHandles) && this.beginRotation(event)) return;
    if (this.intersects(this.translateHandles)) {
      const canMove = this.surface
        ? this.capabilities.canTranslateOnActiveSurface
        : this.capabilities.canTranslateInPanelPlane;
      if (!canMove || !this.selectedPanelId) return;
      this.draggingPanelId = this.selectedPanelId;
      this.pendingPlacement = null;
      this.pendingLocalDelta = null;
      if (!this.surface && !this.beginPlanarTranslation()) {
        this.draggingPanelId = null;
        return;
      }
      this.capturePointer(event);
      this.moveSelectedPanel(event);
      return;
    }

    const controllerHit = this.controllerLayerVisible && this.controllerTarget &&
      isObjectEffectivelyVisible(this.controllerTarget)
      ? this.raycaster.intersectObject(this.controllerTarget, true)[0]
      : undefined;
    const panelHit = this.raycaster.intersectObjects(
      [...this.panelTargets.values()].filter(isObjectEffectivelyVisible),
      false,
    )[0];
    const target = nearestEditorTarget(controllerHit, panelHit);
    if (target === "controller") {
      this.select(null, true);
      this.selectingPointerId = event.pointerId;
      this.capturePointer(event);
      return;
    }

    const panelId = panelHit?.object.userData.panelId as string | undefined;
    if (target === "panel" && panelId && this.capabilities.canSelectPanels) {
      this.select(panelId);
      this.selectingPointerId = event.pointerId;
      this.capturePointer(event);
      return;
    }

    const surfaceHit = this.surface
      ? this.raycaster.intersectObject(this.surface, false)[0]
      : undefined;
    const candidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    if (surfaceHit?.faceIndex != null) this.surfacePointerCandidate = candidate;
    else this.backgroundPointerCandidate = candidate;
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.draggingPanelId) this.moveSelectedPanel(event);
    else if (this.rotatingPanelId) this.rotateSelectedPanel(event);
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.draggingPanelId) {
      this.moveSelectedPanel(event);
      const panelId = this.draggingPanelId;
      this.draggingPanelId = null;
      this.releasePointer(event);
      if (this.pendingPlacement) {
        this.onPlacementCommit?.(this.pendingPlacement);
        this.pendingPlacement = null;
      } else if (this.pendingLocalDelta &&
        Math.hypot(this.pendingLocalDelta.deltaX, this.pendingLocalDelta.deltaY) > 1e-8) {
        this.onLocalTranslationCommit?.(
          panelId,
          this.pendingLocalDelta.deltaX,
          this.pendingLocalDelta.deltaY,
        );
        this.pendingLocalDelta = null;
      }
      this.planarDrag = null;
      return;
    }
    if (this.rotatingPanelId) {
      this.rotateSelectedPanel(event);
      const panelId = this.rotatingPanelId;
      const degrees = this.pendingRotationDegrees;
      this.rotatingPanelId = null;
      this.pendingRotationDegrees = 0;
      this.releasePointer(event);
      if (Math.abs(degrees) > 1e-8) {
        this.onRotationCommit?.(panelId, degrees);
      }
      return;
    }
    if (this.selectingPointerId === event.pointerId) {
      this.selectingPointerId = null;
      this.releasePointer(event);
      return;
    }

    const background = this.backgroundPointerCandidate;
    if (background?.pointerId === event.pointerId) {
      this.backgroundPointerCandidate = null;
      if (isBackgroundClick(
        background, event.pointerId, event.clientX, event.clientY,
      )) this.select(null);
      return;
    }
    const down = this.surfacePointerCandidate;
    if (!down || down.pointerId !== event.pointerId) return;
    this.surfacePointerCandidate = null;
    if (!isBackgroundClick(
      down, event.pointerId, event.clientX, event.clientY,
    )) return;
    this.updateRaycaster(event);
    const hit = this.surface
      ? this.raycaster.intersectObject(this.surface, false)[0]
      : undefined;
    if (!hit || hit.faceIndex == null) return;
    if (this.capabilities.canCreateOnActiveSurface) {
      this.select(null);
      this.onAddPanelCommit?.(this.placementFromSurfaceHit(hit));
    }
  };

  private readonly pointerCancel = (event: PointerEvent): void => {
    const active = this.activeTransformControls;
    if (active?.dragging) {
      this.disconnectPointerListeners();
      cancelFreePanelTransform(active);
      this.activeTransformControls = null;
      this.transformStart = null;
      this.reconnectTransformControls();
      this.connectPointerListeners();
      this.updateTransformControlAvailability();
      this.controls.enabled = true;
    }
    if (this.backgroundPointerCandidate?.pointerId === event.pointerId) {
      this.backgroundPointerCandidate = null;
    }
    if (this.surfacePointerCandidate?.pointerId === event.pointerId) {
      this.surfacePointerCandidate = null;
    }
    if (this.selectingPointerId === event.pointerId) {
      this.selectingPointerId = null;
    }
    this.draggingPanelId = null;
    this.rotatingPanelId = null;
    this.pendingPlacement = null;
    this.pendingLocalDelta = null;
    this.planarDrag = null;
    this.pendingRotationDegrees = 0;
    this.releasePointer(event);
  };

  private connectPointerListeners(): void {
    this.domElement.addEventListener("pointerdown", this.pointerDown);
    this.domElement.addEventListener("pointermove", this.pointerMove);
    this.domElement.addEventListener("pointerup", this.pointerUp);
    this.domElement.addEventListener("pointercancel", this.pointerCancel);
  }

  private disconnectPointerListeners(): void {
    this.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.domElement.removeEventListener("pointermove", this.pointerMove);
    this.domElement.removeEventListener("pointerup", this.pointerUp);
    this.domElement.removeEventListener("pointercancel", this.pointerCancel);
  }

  private reconnectTransformControls(): void {
    reconnectFreePanelTransformControls(
      [this.translateControls, this.rotateControls],
      this.domElement,
    );
  }

  private capturePointer(event: PointerEvent): void {
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
  }

  private releasePointer(event: PointerEvent): void {
    this.controls.enabled = true;
    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }
  }

  private updateRaycaster(event: PointerEvent): void {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private intersects(objects: THREE.Object3D[]): boolean {
    return objects.length > 0 &&
      this.raycaster.intersectObjects(objects, true).length > 0;
  }

  private placementFromSurfaceHit(hit: THREE.Intersection): SurfacePlacement {
    const normal = this.interpolatedNormal(hit).normalize();
    const orientation = this.attachmentSurface === "mechanical-shell"
      ? this.mechanicalSurfaceOrientation(hit, normal)
      : createSurfaceOrientation(tuple(normal));
    const position = hit.point.clone().addScaledVector(normal, this.normalOffset);
    return {
      position: tuple(position),
      orientation,
      attachment: {
        surface: this.attachmentSurface,
        triangleIndex: hit.faceIndex!,
        barycentric: tuple(this.barycentric(hit)),
        normalOffset: this.normalOffset,
      },
    };
  }

  private beginRotation(event: PointerEvent): boolean {
    if (!this.selectedPanelId) return false;
    const target = this.panelTargets.get(this.selectedPanelId);
    if (!target) return false;
    const center = new THREE.Vector3().setFromMatrixPosition(target.matrix);
    const normal = new THREE.Vector3().setFromMatrixColumn(target.matrix, 2)
      .normalize();
    const point = this.raycaster.ray.intersectPlane(
      new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
      new THREE.Vector3(),
    );
    if (!point || point.distanceToSquared(center) < 1e-8) return false;
    this.rotationStartDirection.copy(point).sub(center).normalize();
    this.rotationStartXAxis.setFromMatrixColumn(target.matrix, 0).normalize();
    this.rotationStartYAxis.setFromMatrixColumn(target.matrix, 1).normalize();
    this.rotatingPanelId = this.selectedPanelId;
    this.pendingRotationDegrees = 0;
    this.capturePointer(event);
    return true;
  }

  private rotateSelectedPanel(event: PointerEvent): void {
    if (!this.rotatingPanelId) return;
    const target = this.panelTargets.get(this.rotatingPanelId);
    if (!target) return;
    this.updateRaycaster(event);
    const center = new THREE.Vector3().setFromMatrixPosition(target.matrix);
    const normal = new THREE.Vector3().setFromMatrixColumn(target.matrix, 2)
      .normalize();
    const point = this.raycaster.ray.intersectPlane(
      new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
      new THREE.Vector3(),
    );
    if (!point || point.distanceToSquared(center) < 1e-8) return;
    const current = point.sub(center).normalize();
    const cross = new THREE.Vector3().crossVectors(
      this.rotationStartDirection,
      current,
    );
    const radians = Math.atan2(
      normal.dot(cross),
      this.rotationStartDirection.dot(current),
    );
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const xAxis = this.rotationStartXAxis.clone().multiplyScalar(cosine)
      .addScaledVector(this.rotationStartYAxis, sine).normalize();
    const yAxis = this.rotationStartXAxis.clone().multiplyScalar(-sine)
      .addScaledVector(this.rotationStartYAxis, cosine).normalize();
    this.setTargetMatrix(target, xAxis, yAxis, normal, center);
    this.gizmo.matrix.copy(target.matrix);
    this.pendingRotationDegrees = THREE.MathUtils.radToDeg(radians);
  }

  private beginPlanarTranslation(): boolean {
    if (!this.draggingPanelId) return false;
    const target = this.panelTargets.get(this.draggingPanelId);
    if (!target) return false;
    const center = new THREE.Vector3().setFromMatrixPosition(target.matrix);
    const xAxis = new THREE.Vector3().setFromMatrixColumn(target.matrix, 0).normalize();
    const yAxis = new THREE.Vector3().setFromMatrixColumn(target.matrix, 1).normalize();
    const normal = new THREE.Vector3().setFromMatrixColumn(target.matrix, 2).normalize();
    this.planarDrag = beginPanelPlaneDrag(
      this.raycaster.ray, center, xAxis, yAxis, normal,
    );
    return this.planarDrag !== null;
  }

  private moveSelectedPanel(event: PointerEvent): void {
    if (!this.draggingPanelId) return;
    const target = this.panelTargets.get(this.draggingPanelId);
    if (!target) return;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.surface) {
      const drag = this.planarDrag;
      if (!drag) return;
      const update = updatePanelPlaneDrag(this.raycaster.ray, drag);
      if (!update) return;
      const { position } = update;
      this.setTargetMatrix(
        target, drag.xAxis, drag.yAxis, drag.normal, position,
      );
      this.gizmo.matrix.copy(target.matrix);
      this.pendingLocalDelta = {
        deltaX: update.deltaX,
        deltaY: update.deltaY,
      };
      return;
    }
    const hit = this.raycaster.intersectObject(this.surface, false)[0];
    if (!hit || hit.faceIndex == null) return;
    const faceIndex = hit.faceIndex;
    const normal = this.interpolatedNormal(hit).normalize();
    const oldXAxis = tuple(new THREE.Vector3().setFromMatrixColumn(target.matrix, 0));
    const projected = projectPanelOrientationOntoSurface(oldXAxis, tuple(normal));
    const xAxis = new THREE.Vector3(...projected.xAxis);
    const yAxis = new THREE.Vector3(...projected.yAxis);
    const position = hit.point.clone().addScaledVector(normal, this.normalOffset);
    this.setTargetMatrix(target, xAxis, yAxis, normal, position);
    this.gizmo.matrix.copy(target.matrix);
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
        surface: this.attachmentSurface,
        triangleIndex: faceIndex,
        barycentric: tuple(barycentric),
        normalOffset: this.normalOffset,
      },
    };
  }

  private mechanicalSurfaceOrientation(
    hit: THREE.Intersection,
    normal: THREE.Vector3,
  ) {
    const geometry = this.surface!.geometry;
    const positions = geometry.getAttribute("position");
    const indices = geometry.index;
    if (!indices || hit.faceIndex == null) {
      return createSurfaceOrientation(tuple(normal));
    }
    const offset = hit.faceIndex * 3;
    const vertices = [0, 1, 2].map((vertex) =>
      tuple(
        new THREE.Vector3().fromBufferAttribute(
          positions,
          indices.getX(offset + vertex),
        ),
      )
    ) as [Vector3Tuple, Vector3Tuple, Vector3Tuple];
    return createMechanicalSurfaceOrientation(
      tuple(normal),
      vertices,
    );
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

  private select(panelId: string | null, controller = false): void {
    const controllerSelected = controller && this.controllerTarget !== null;
    this.selectedPanelId = panelId;
    this.controllerSelected = controllerSelected;
    this.updateHighlight();
    this.updateGizmo();
    this.applySelectionFocus();
    this.onSelectionChange?.(panelId);
    this.onControllerSelectionChange?.(controllerSelected);
  }

  private updateHighlight(): void {
    for (const [panelId, target] of this.panelTargets) {
      const material = target.material as THREE.MeshBasicMaterial;
      material.opacity = panelId === this.selectedPanelId ? 0.3 : 0.025;
      material.color.set(panelId === this.selectedPanelId ? 0xffb35c : 0x6ef8ee);
      if ((this.selectedPanelId || this.controllerSelected) &&
        panelId !== this.selectedPanelId) {
        const grey = focusedGrey(material.color);
        material.color.setRGB(grey.r, grey.g, grey.b);
      }
    }
  }

  private updateGizmo(): void {
    this.disposeGizmo();
    if (!this.interactionEnabled) {
      this.gizmo.visible = false;
      this.translateControls.detach();
      this.rotateControls.detach();
      this.translateControls.enabled = false;
      this.rotateControls.enabled = false;
      this.translateHelper.visible = false;
      this.rotateHelper.visible = false;
      return;
    }
    const target = this.selectedTransformTarget();
    if (!target) {
      this.gizmo.visible = false;
      this.translateControls.detach();
      this.rotateControls.detach();
      return;
    }
    const targetGeometry = "geometry" in target
      ? (target as THREE.Mesh).geometry
      : undefined;
    targetGeometry?.computeBoundingBox();
    const size = targetGeometry?.boundingBox?.getSize(new THREE.Vector3()) ??
      new THREE.Vector3(66, 65, 1);
    const lift = size.z / 2 + 2;

    if (this.transformMode === "surface" && !this.controllerSelected) {
      const translateMaterial = new THREE.MeshBasicMaterial({
        color: 0x42e8df,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const translatePad = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 16),
        translateMaterial,
      );
      translatePad.position.z = lift;
      translatePad.renderOrder = 20;
      translatePad.name = "local-xy-translate-handle";
      translatePad.visible = this.capabilities.canTranslateOnActiveSurface ||
        this.capabilities.canTranslateInPanelPlane;
      this.gizmo.add(translatePad);
      this.translateHandles.push(translatePad);

      const arrowLength = Math.min(size.x, size.y) * 0.32;
      const xArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, lift),
        arrowLength,
        0xff5b67,
        5,
        3,
      );
      const yArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, lift),
        arrowLength,
        0x58e87a,
        5,
        3,
      );
      xArrow.name = "local-x-translation-axis";
      yArrow.name = "local-y-translation-axis";
      xArrow.visible = translatePad.visible;
      yArrow.visible = translatePad.visible;
      xArrow.traverse((object) => { object.renderOrder = 20; });
      yArrow.traverse((object) => { object.renderOrder = 20; });
      this.gizmo.add(xArrow, yArrow);
      this.translateHandles.push(xArrow, yArrow);

      const rotateMaterial = new THREE.MeshBasicMaterial({
        color: 0x5ca8ff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const rotateRing = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(size.x, size.y) * 0.62, 1.2, 10, 80),
        rotateMaterial,
      );
      rotateRing.position.z = lift;
      rotateRing.renderOrder = 20;
      rotateRing.name = "local-z-rotation-handle";
      rotateRing.visible = this.capabilities.canRotateSelectedPanel;
      this.gizmo.add(rotateRing);
      this.rotateHandles.push(rotateRing);
    }

    if (this.capabilities.canDeleteSelectedPanel && this.selectedPanelId) {
      const button = document.createElement("button");
      button.className = "panel-delete-billboard";
      button.type = "button";
      button.textContent = "×";
      button.title = `Delete selected panel ${this.selectedPanelId}`;
      button.setAttribute(
        "aria-label",
        `Delete selected panel ${this.selectedPanelId}`,
      );
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const panelId = this.selectedPanelId;
        if (panelId && this.capabilities.canDeleteSelectedPanel) {
          this.onDeletePanelRequest?.(panelId);
        }
      });
      const close = new CSS2DObject(button);
      close.name = "delete-selected-panel";
      close.position.set(size.x / 2 + 7, size.y / 2 + 7, lift + 0.2);
      close.renderOrder = 10_000;
      this.gizmo.add(close);
    }

    this.gizmo.visible = !this.controllerSelected;
    if (!this.controllerSelected) {
      this.gizmo.matrix.copy(target.matrix);
      this.gizmo.matrixAutoUpdate = false;
      this.gizmo.updateMatrixWorld(true);
    }
    if (this.transformMode === "free-3d" || this.controllerSelected) {
      this.updateTransformControlAvailability();
      this.translateControls.attach(target);
      this.rotateControls.attach(target);
    }
  }

  private updateTransformControlAvailability(): void {
    if (this.activeTransformControls) return;
    if (this.controllerSelected) {
      this.translateControls.enabled = true;
      this.rotateControls.enabled = true;
      return;
    }
    this.translateControls.enabled = this.transformMode === "free-3d" &&
      (this.capabilities.canTranslateOnActiveSurface ||
        this.capabilities.canTranslateInPanelPlane);
    this.rotateControls.enabled = this.transformMode === "free-3d" &&
      this.capabilities.canRotateSelectedPanel;
  }

  private disposeGizmo(): void {
    this.translateControls.detach();
    this.rotateControls.detach();
    this.translateHandles.length = 0;
    this.rotateHandles.length = 0;
    for (const child of [...this.gizmo.children]) {
      child.traverse((object) => {
        if (object instanceof CSS2DObject) {
          object.element.remove();
          return;
        }
        const renderable = object as THREE.Mesh;
        renderable.geometry?.dispose();
        const material = renderable.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      this.gizmo.remove(child);
    }
  }

  private applySelectionFocus(): void {
    if (this.surface) {
      const material = this.surface.material as THREE.MeshBasicMaterial;
      const base = new THREE.Color(0x376478);
      if (this.selectedPanelId || this.controllerSelected) {
        const grey = focusedGrey(base);
        material.color.setRGB(grey.r, grey.g, grey.b);
      } else {
        material.color.copy(base);
      }
    }
    this.updateHighlight();
  }

  private setTargetMatrix(
    target: THREE.Object3D,
    xAxis: THREE.Vector3,
    yAxis: THREE.Vector3,
    normal: THREE.Vector3,
    position: THREE.Vector3,
  ): void {
    target.matrix.set(
      xAxis.x, yAxis.x, normal.x, position.x,
      xAxis.y, yAxis.y, normal.y, position.y,
      xAxis.z, yAxis.z, normal.z, position.z,
      0, 0, 0, 1,
    );
    target.matrix.decompose(target.position, target.quaternion, target.scale);
    target.matrixAutoUpdate = true;
    target.updateMatrix();
  }

  private applyPanelTransform(target: THREE.Object3D, panel: PanelDefinition): void {
    this.setTargetMatrix(
      target,
      new THREE.Vector3(panel.xAxis.x, panel.xAxis.y, panel.xAxis.z),
      new THREE.Vector3(panel.yAxis.x, panel.yAxis.y, panel.yAxis.z),
      new THREE.Vector3(panel.normal.x, panel.normal.y, panel.normal.z),
      new THREE.Vector3(panel.position.x, panel.position.y, panel.position.z),
    );
  }

  private updatePointer(event: PointerEvent): void {
    const bounds = this.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
  }
}
