/**
 * The square crop behind the profile photo's "Adjust your photo" step (plan 9.3). Pure geometry, in units of the
 * square frame's side: the photo covers the frame at zoom 1 and grows with the zoom, and `center` is the point of
 * the photo (0..1 across and down) at the frame's middle. Nothing here decides anything for the app: the server
 * still re-encodes whatever it gets (src/modules/files/uploads.ts).
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export interface CropState {
  zoom: number;
  /** The photo's point at the frame's middle, 0..1 across and down. */
  center: { x: number; y: number };
}

export interface ImageSize {
  width: number;
  height: number;
}

/** The photo's size in frame sides: the shorter edge fills the frame at zoom 1. */
export function displayedSize(image: ImageSize, zoom: number): { width: number; height: number } {
  const shorter = Math.min(image.width, image.height);
  return { width: (image.width / shorter) * zoom, height: (image.height / shorter) * zoom };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Keeps the frame covered: the middle can't come closer to an edge than half a frame. */
export function clampCrop(image: ImageSize, state: CropState): CropState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const size = displayedSize(image, zoom);
  const halfX = 0.5 / size.width;
  const halfY = 0.5 / size.height;
  return { zoom, center: { x: clamp(state.center.x, halfX, 1 - halfX), y: clamp(state.center.y, halfY, 1 - halfY) } };
}

export const initialCrop: CropState = { zoom: 1, center: { x: 0.5, y: 0.5 } };

/** Moves the photo by a drag of `dx`, `dy` frame sides (right and down move the photo right and down). */
export function moveCrop(image: ImageSize, state: CropState, dx: number, dy: number): CropState {
  const size = displayedSize(image, state.zoom);
  return clampCrop(image, { zoom: state.zoom, center: { x: state.center.x - dx / size.width, y: state.center.y - dy / size.height } });
}

/** Where the photo sits in the frame, as CSS percentages of the frame (for the preview). */
export function photoBox(image: ImageSize, state: CropState): { left: number; top: number; width: number; height: number } {
  const size = displayedSize(image, state.zoom);
  return { left: (0.5 - state.center.x * size.width) * 100, top: (0.5 - state.center.y * size.height) * 100, width: size.width * 100, height: size.height * 100 };
}

/** The square of the original image (in its pixels) that the frame shows: what gets drawn into the upload. */
export function sourceSquare(image: ImageSize, state: CropState): { x: number; y: number; size: number } {
  const { width } = displayedSize(image, state.zoom);
  const size = image.width / width;
  return { x: state.center.x * image.width - size / 2, y: state.center.y * image.height - size / 2, size };
}
