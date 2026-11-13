/**
 * The mini-map's camera, as plain math (no three.js), so the scene generator, the renderer and the HTML cards
 * all agree on where things land on the stage. Each layout of the town has its own stage (a fixed box the
 * hero scales: 16:10 beside the headline on wide screens, a band under it on narrow ones) and its own view;
 * the camera looks at the town from the south-east and above, like a model on a table, from far enough that
 * the houses read small and the town reads wide.
 *
 * Axes are three.js's: x east, y up, z south. A ground point (x, y) of the scene's world is (x, 0, y) here.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A stage: the box the camera's picture fills (its units are the composition's). */
export interface Frame {
  width: number;
  height: number;
}

/** Where the camera looks (on the ground), from how far, from which side and how wide. */
export interface View {
  target: V3;
  distance: number;
  /** Around the vertical axis, from the south-east (degrees); 45 is a classic isometric view. */
  azimuth: number;
  /** Above the horizon (degrees). */
  elevation: number;
  /** Vertical field of view (degrees): narrow, like a long lens on a model. */
  fov: number;
}

/** The wide layout's stage and view (beside the headline). */
export const STAGE: Frame = { width: 1600, height: 1000 };
export const VIEW: View = {
  target: { x: 0, y: 0, z: 0 },
  distance: 6400,
  azimuth: 45,
  elevation: 38,
  fov: 12.6,
};

export interface CameraPose {
  position: V3;
  target: V3;
  /** Vertical field of view, degrees. */
  fov: number;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (a: V3): V3 => {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};

/**
 * The camera, nudged by `yaw` and `pitch` (degrees) for the pointer's parallax, `tilt` (0–1) toward a view from
 * straight above (the hero hands over to the real map as it scrolls away), and `zoom` (> 1 is farther).
 */
export function cameraPose(yaw = 0, pitch = 0, tilt = 0, zoom = 1, view: View = VIEW): CameraPose {
  const azimuth = ((view.azimuth + yaw) * Math.PI) / 180;
  const elevation = ((view.elevation + pitch + tilt * (84 - view.elevation)) * Math.PI) / 180;
  const distance = view.distance * zoom;
  const horizontal = Math.cos(elevation) * distance;
  return {
    target: view.target,
    position: {
      x: view.target.x + Math.sin(azimuth) * horizontal,
      y: view.target.y + Math.sin(elevation) * distance,
      z: view.target.z + Math.cos(azimuth) * horizontal,
    },
    fov: view.fov,
  };
}

function basis(pose: CameraPose, frame: Frame) {
  const forward = normalize(sub(pose.target, pose.position));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const tanV = Math.tan((pose.fov * Math.PI) / 360);
  const tanH = tanV * (frame.width / frame.height);
  return { forward, right, up, tanV, tanH };
}

/** Projects points to the stage (its units, y down), with their distance from the camera. */
export function projector(pose: CameraPose = cameraPose(), frame: Frame = STAGE) {
  const { forward, right, up, tanV, tanH } = basis(pose, frame);
  return (point: V3) => {
    const v = sub(point, pose.position);
    const depth = dot(v, forward);
    return {
      x: ((dot(v, right) / (depth * tanH) + 1) / 2) * frame.width,
      y: ((1 - dot(v, up) / (depth * tanV)) / 2) * frame.height,
      depth,
    };
  };
}

/** The point at height `height` that the camera sees at a stage point (the inverse of `projector`). */
export function unprojector(pose: CameraPose = cameraPose(), frame: Frame = STAGE) {
  const { forward, right, up, tanV, tanH } = basis(pose, frame);
  return (stageX: number, stageY: number, height = 0): { x: number; y: number } => {
    const nx = (stageX / frame.width) * 2 - 1;
    const ny = 1 - (stageY / frame.height) * 2;
    const ray = { x: forward.x + right.x * nx * tanH + up.x * ny * tanV, y: forward.y + right.y * nx * tanH + up.y * ny * tanV, z: forward.z + right.z * nx * tanH + up.z * ny * tanV };
    const t = (height - pose.position.y) / ray.y;
    return { x: pose.position.x + ray.x * t, y: pose.position.z + ray.z * t };
  };
}
