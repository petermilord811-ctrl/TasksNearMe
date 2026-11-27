import { IDENTITY_CAPTURE_RULES } from '@/contracts';

/**
 * Photos for the verification flows, made in the browser before they're sent: shrunk to at most
 * `IDENTITY_CAPTURE_RULES.photoEdgePx` on the longer side as a JPEG (no metadata), and a quick look at whether one
 * came out too dark or blurry, so the person can retake it at once (our server reads it anyway).
 */

/** Draws an image at most `edge` px on its longer side, as a JPEG. */
export function toJpeg(source: CanvasImageSource, width: number, height: number, edge: number = IDENTITY_CAPTURE_RULES.photoEdgePx): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/** A chosen file, shrunk before it's sent; one the browser can't draw (HEIC on most) goes as it is. */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export const previewUrl = (blob: Blob) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '');

export interface PhotoLook {
  dark: boolean;
  blurry: boolean;
}

/** Below this mean brightness (0–255) a photo is too dark to read. */
const DARK_BELOW = 55;
/** Below this variance of the Laplacian (on a 400 px copy) a document photo is likely blurred. */
const BLURRY_BELOW = 55;

/**
 * Whether a photo looks too dark or blurry: its mean brightness, and the variance of its Laplacian (sharp edges make it
 * high), on a small gray copy. A hint for the person, never a rule: null when the browser can't draw the photo.
 */
export async function lookAtPhoto(blob: Blob, kind: 'document' | 'face'): Promise<PhotoLook | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(8, Math.round(bitmap.width * scale));
    const height = Math.max(8, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const gray = new Float32Array(width * height);
    let sum = 0;
    for (let i = 0; i < gray.length; i++) {
      const value = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
      gray[i] = value;
      sum += value;
    }
    const mean = sum / gray.length;
    let count = 0;
    let lapSum = 0;
    let lapSquares = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
        lapSum += lap;
        lapSquares += lap * lap;
        count++;
      }
    }
    const variance = count > 0 ? lapSquares / count - (lapSum / count) ** 2 : 0;
    // A face is smooth by nature: only a document's print says much about blur.
    return { dark: mean < DARK_BELOW, blurry: kind === 'document' && variance < BLURRY_BELOW };
  } catch {
    return null;
  }
}
