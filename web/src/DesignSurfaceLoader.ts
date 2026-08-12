import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import {
  createMechanicalShellTriangleMesh,
  validateWatertightTriangleMesh,
  type SurfaceMeshValidation,
} from "../../src/sculpture/DesignSurface.ts";

export interface LoadedDesignSurface {
  geometry: THREE.BufferGeometry;
  sha256: string;
  validation: SurfaceMeshValidation;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export function loadMechanicalShellDesignSurface(
  definition: PanelAssemblyDefinition,
): LoadedDesignSurface {
  const { positions, indices, validation } =
    createMechanicalShellTriangleMesh(definition);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, sha256: "", validation };
}

export async function loadGlbDesignSurface(
  buffer: ArrayBuffer,
  scaleToMillimeters: number,
): Promise<LoadedDesignSurface> {
  if (!Number.isFinite(scaleToMillimeters) || scaleToMillimeters <= 0) {
    throw new Error("GLB scale-to-millimetres must be a positive number.");
  }
  if (
    buffer.byteLength < 12 ||
    new DataView(buffer).getUint32(0, true) !== 0x46546c67 ||
    new DataView(buffer).getUint32(4, true) !== 2
  ) {
    throw new Error("Design surfaces must be binary glTF 2.0 GLB files.");
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  const positions: number[] = [];
  const indices: number[] = [];
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute("position");
    if (!(position instanceof THREE.BufferAttribute)) {
      throw new Error("Every GLB mesh primitive needs POSITION data.");
    }
    const vertexOffset = positions.length / 3;
    const point = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      point
        .fromBufferAttribute(position, index)
        .applyMatrix4(object.matrixWorld)
        .multiplyScalar(scaleToMillimeters);
      positions.push(point.x, point.y, point.z);
    }
    const sourceIndices = object.geometry.index;
    if (sourceIndices) {
      for (let index = 0; index < sourceIndices.count; index += 1) {
        indices.push(vertexOffset + sourceIndices.getX(index));
      }
    } else {
      if (position.count % 3 !== 0) {
        throw new Error("A non-indexed GLB primitive must contain complete triangles.");
      }
      for (let index = 0; index < position.count; index += 1) {
        indices.push(vertexOffset + index);
      }
    }
  });
  if (positions.length === 0) throw new Error("The GLB contains no triangle mesh.");
  let validation = validateWatertightTriangleMesh(positions, indices);
  if (validation.signedVolume < 0) {
    for (let index = 0; index < indices.length; index += 3) {
      [indices[index + 1], indices[index + 2]] = [
        indices[index + 2]!,
        indices[index + 1]!,
      ];
    }
    validation = validateWatertightTriangleMesh(positions, indices);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const sha256 = hex(await crypto.subtle.digest("SHA-256", buffer));
  return { geometry, sha256, validation };
}
