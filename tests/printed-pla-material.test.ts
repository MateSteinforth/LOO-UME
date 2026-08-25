import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPrintedPlaMaterial } from "../web/src/PrintedPlaMaterial.ts";

describe("printed PLA preview material", () => {
  it("is opaque black with a broad reflective highlight", () => {
    const clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const material = createPrintedPlaMaterial({
      clippingPlanes: [clippingPlane],
    });

    expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
    expect(material.color.getHex()).toBe(0x0a0c0f);
    expect(material.specular.getHex()).toBe(0xaeb8c2);
    expect(material.shininess).toBe(36);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.clippingPlanes).toEqual([clippingPlane]);
  });
});
