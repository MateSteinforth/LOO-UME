export interface CameraClippingRange {
  near: number;
  far: number;
}

const MOBILE_FIT_PADDING = 1.12;
const DESKTOP_FIT_PADDING = 1.34;

export function viewportFitDistance(
  radius: number,
  verticalFovDegrees: number,
  aspect: number,
  sidePanelLayout: boolean,
): number {
  const safeRadius = Math.max(radius, 1);
  const verticalHalfFov = (verticalFovDegrees * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * Math.max(aspect, 0.01),
  );
  const halfFov = sidePanelLayout
    ? Math.min(verticalHalfFov, horizontalHalfFov)
    : verticalHalfFov;
  const padding = sidePanelLayout ? DESKTOP_FIT_PADDING : MOBILE_FIT_PADDING;
  return (safeRadius / Math.sin(halfFov)) * padding;
}

export function cameraClippingRange(
  cameraDistance: number,
  sceneRadius: number,
): CameraClippingRange {
  const distance = Math.max(cameraDistance, 0.001);
  const radius = Math.max(sceneRadius, 1);
  const near = Math.max(
    0.05,
    Math.min(distance * 0.025, Math.max(0.05, distance - radius * 1.25)),
  );
  return {
    near,
    far: Math.max(near + 10, distance + radius * 3),
  };
}
