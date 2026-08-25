import * as THREE from "three";

export interface PrintedPlaMaterialOptions {
  clippingPlanes?: THREE.Plane[];
}

/** Opaque black PLA with a broad highlight that keeps printed form readable. */
export function createPrintedPlaMaterial(
  options: PrintedPlaMaterialOptions = {},
): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0x0a0c0f,
    specular: 0xaeb8c2,
    shininess: 36,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    clippingPlanes: options.clippingPlanes,
  });
}
