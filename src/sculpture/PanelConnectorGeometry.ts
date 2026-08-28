import type { PanelHardwareProfile } from "./Definition.ts";

export type ConnectorVector3 = [number, number, number];

export interface PanelConnectorPoseFrame {
  position: ConnectorVector3;
  xAxis: ConnectorVector3;
  yAxis: ConnectorVector3;
  normal: ConnectorVector3;
}

export interface WiringControllerGeometry {
  position: ConnectorVector3;
  pinPositions: ConnectorVector3[];
}

function add(a: ConnectorVector3, b: ConnectorVector3): ConnectorVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(value: ConnectorVector3, amount: number): ConnectorVector3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

/**
 * Resolve a schematic connector point from the authoritative physical panel
 * pose. Profile connector corners are stored from the PCB back view, so local
 * X is reflected exactly once into the outward-facing right-handed pose.
 */
export function panelConnectorWorldPosition(
  frame: PanelConnectorPoseFrame,
  profile: PanelHardwareProfile,
  edgeInset: number,
  surfaceOffset: number,
  kind: "din" | "dout",
): ConnectorVector3 {
  const corner = kind === "din"
    ? profile.dataConnectors.dinCorner
    : profile.dataConnectors.doutCorner;
  const backX = corner.endsWith("left") ? -1 : 1;
  const outwardX = -backX;
  const y = corner.startsWith("bottom") ? -1 : 1;
  return add(
    add(
      frame.position,
      scale(frame.xAxis, outwardX * (profile.dimensions.width / 2 - edgeInset)),
    ),
    add(
      scale(frame.yAxis, y * (profile.dimensions.height / 2 - edgeInset)),
      scale(frame.normal, -surfaceOffset),
    ),
  );
}

export function panelCenterBehindPcb(
  frame: PanelConnectorPoseFrame,
  surfaceOffset: number,
): ConnectorVector3 {
  return add(frame.position, scale(frame.normal, -surfaceOffset));
}

/** Shared schematic controller geometry used by route cost and tutorial view. */
export function wiringControllerGeometry(
  panelCentersBehindPcbs: readonly ConnectorVector3[],
  outputCount: number,
): WiringControllerGeometry {
  if (panelCentersBehindPcbs.length === 0 || outputCount < 1) {
    throw new Error("Controller geometry requires panels and at least one output.");
  }
  const minimumX = Math.min(...panelCentersBehindPcbs.map((point) => point[0]));
  const maximumX = Math.max(...panelCentersBehindPcbs.map((point) => point[0]));
  const maximumY = Math.max(...panelCentersBehindPcbs.map((point) => point[1]));
  const minimumZ = Math.min(...panelCentersBehindPcbs.map((point) => point[2]));
  const maximumZ = Math.max(...panelCentersBehindPcbs.map((point) => point[2]));
  const position: ConnectorVector3 = [
    (minimumX + maximumX) / 2,
    maximumY + 32,
    (minimumZ + maximumZ) / 2,
  ];
  return {
    position,
    pinPositions: Array.from({ length: outputCount }, (_, index) => [
      position[0] + (index - (outputCount - 1) / 2) * 9,
      position[1] - 8,
      position[2],
    ]),
  };
}
