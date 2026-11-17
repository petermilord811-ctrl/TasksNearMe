/**
 * Gets the hero's 3D town ready off the main thread, so the page stays responsive meanwhile. First it says which
 * GPU draws WebGL here (a context made on an OffscreenCanvas; making one on the page can stall it for a moment),
 * so the page can skip the 3D on a software renderer; then it builds the layout's town (the pure scene from
 * `scene.ts`: plates, water, roads, houses, trees, movers…) and posts everything the town draws (`TownModel`).
 * The fields' functions stay here.
 */
import type { TownFlora } from './flora';
import { townScene, type TownLayout, type TownModel } from './scene';

export interface SceneRequest {
  layout: TownLayout;
  /** Which region's plants grow (the market's). */
  flora: TownFlora;
}

export type SceneReply =
  /** The WebGL renderer's name, or null when this worker can't tell (no OffscreenCanvas or no WebGL 2 here). */
  | { kind: 'gpu'; renderer: string | null }
  | { kind: 'scene'; layout: TownLayout; flora: TownFlora; model: TownModel };

// A worker's global scope (typed by hand: the project's types are the DOM's, not the worker's).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SceneRequest>) => void) | null;
  postMessage: (message: SceneReply) => void;
};

function rendererName(): string | null {
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return null;
  }
}

scope.onmessage = (event) => {
  const { layout, flora } = event.data;
  scope.postMessage({ kind: 'gpu', renderer: rendererName() });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the functions can't be posted
  const { fields, ...model } = townScene(layout, flora);
  scope.postMessage({ kind: 'scene', layout, flora, model });
};
