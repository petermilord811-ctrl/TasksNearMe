import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import path from 'node:path';
import type { FaceFindings } from './face';

/**
 * The face checks of our own ID check (owner, 2026-11-27: the license checked deeply on our own server, open-source
 * technology, no paid services): a Node process of its own, started for one check and killed after it, that runs
 * OpenCV (@techstark/opencv-js: OpenCV 5 built to WebAssembly, Apache-2.0) with open models shipped in vendor/face-models
 * (nothing is downloaded): YuNet finds the faces on the ID's front and in the selfie with 5 landmarks each, SFace turns
 * each face (aligned to its landmarks) into 128 numbers whose cosine says how alike they are, and two MiniFASNet models
 * say how likely the selfie is of a live person rather than a photo of a photo or a screen. Only numbers come back:
 * face counts, the similarity, the selfie's head pose, the liveness and how colorful the ID's photo is; no image, no
 * embedding, nothing logged. Like the document readers (engine.ts): its own memory and time budget, killed past either,
 * none of the server's environment, background priority, one check at a time per server process.
 *
 * Measured 2026-11-27 (4-CPU VPS): about 2 s and 450 MB for an ID front at 1,024 px and a selfie at 640 px.
 */

export const FACE_BUDGET_MS = 60_000;
export const FACE_MEMORY_BYTES = 768 * 1024 * 1024;
const FACE_HEAP_MB = 256;

/** The models' folder (the standalone bundle keeps it: next.config.ts). */
const modelsPath = () => path.join(/*turbopackIgnore: true*/ process.cwd(), 'vendor', 'face-models');

const FACE_SOURCE = String.raw`
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);
const fs = require('node:fs');
const path = require('node:path');
const MODELS = process.env.TNM_FACE_MODELS;
let cv = null;
let detector = null;
let recognizer = null;
let antiSpoof = null;

async function opencv() {
  if (cv) return cv;
  const loaded = require('@techstark/opencv-js');
  cv = typeof loaded.then === 'function' ? await loaded : loaded.Mat ? loaded : await new Promise((resolve) => { loaded.onRuntimeInitialized = () => resolve(loaded); });
  return cv;
}

function model(name) {
  const target = '/' + name;
  cv.FS.writeFile(target, fs.readFileSync(path.join(MODELS, name)));
  return target;
}

const unreadable = () => Object.assign(new Error('image'), { name: 'UnreadableImage' });

// A photo as OpenCV's BGR image, upright, at most maxEdge px on its longer side.
async function bgr(bytes, maxEdge) {
  let decoded;
  try {
    decoded = await sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: 40000000 })
      .autoOrient()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw unreadable();
  }
  const { data, info } = decoded;
  if (info.channels < 3) throw unreadable();
  const mat = new cv.Mat(info.height, info.width, cv.CV_8UC3);
  const target = mat.data;
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
    target[j] = data[i + 2];
    target[j + 1] = data[i + 1];
    target[j + 2] = data[i];
  }
  return mat;
}

// Faces: box, 5 landmarks (right eye, left eye, nose, right and left mouth corners) and score, most confident first.
function faces(mat, threshold) {
  if (!detector) detector = new cv.FaceDetectorYN(model('yunet.onnx'), '', new cv.Size(320, 320), 0.5, 0.3, 20);
  detector.setScoreThreshold(threshold);
  detector.setInputSize(new cv.Size(mat.cols, mat.rows));
  const out = new cv.Mat();
  detector.detect(mat, out);
  const list = [];
  for (let r = 0; r < out.rows; r++) {
    const f = out.data32F.slice(r * 15, r * 15 + 15);
    list.push({ box: [f[0], f[1], f[2], f[3]], landmarks: [[f[4], f[5]], [f[6], f[7]], [f[8], f[9]], [f[10], f[11]], [f[12], f[13]]], score: f[14] });
  }
  out.delete();
  return list.sort((a, b) => b.score - a.score);
}

// The face aligned to ArcFace's 112 x 112 template (a least-squares similarity transform of its landmarks, as OpenCV's
// FaceRecognizerSF.alignCrop does), then SFace's 128 numbers, normalized.
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
function similarityTransform(points) {
  let sx = 0, sy = 0, rx = 0, ry = 0;
  for (let i = 0; i < 5; i++) { sx += points[i][0]; sy += points[i][1]; rx += TEMPLATE[i][0]; ry += TEMPLATE[i][1]; }
  sx /= 5; sy /= 5; rx /= 5; ry /= 5;
  let p = 0, q = 0, d = 0;
  for (let i = 0; i < 5; i++) {
    const x = points[i][0] - sx, y = points[i][1] - sy, u = TEMPLATE[i][0] - rx, v = TEMPLATE[i][1] - ry;
    p += x * u + y * v;
    q += x * v - y * u;
    d += x * x + y * y;
  }
  const a = p / d, b = q / d;
  return [a, -b, rx - (a * sx - b * sy), b, a, ry - (b * sx + a * sy)];
}

function embedding(mat, face) {
  if (!recognizer) recognizer = cv.readNetFromONNX(model('sface-int8.onnx'));
  const transform = cv.matFromArray(2, 3, cv.CV_64F, similarityTransform(face.landmarks));
  const aligned = new cv.Mat();
  cv.warpAffine(mat, aligned, transform, new cv.Size(112, 112), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  const blob = cv.blobFromImage(aligned, 1, new cv.Size(112, 112), new cv.Scalar(0, 0, 0), true, false);
  recognizer.setInput(blob);
  const out = recognizer.forward();
  const vector = Float32Array.from(out.data32F);
  transform.delete(); aligned.delete(); blob.delete(); out.delete();
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

// MiniFASNet V2 (the face box scaled 2.7) and V1SE (scaled 4.0), 80 x 80 BGR crops: the chance of class 1 (real), averaged.
function liveness(mat, face) {
  if (!antiSpoof) antiSpoof = [{ net: cv.readNetFromONNX(model('minifasnet-v2.onnx')), scale: 2.7 }, { net: cv.readNetFromONNX(model('minifasnet-v1se.onnx')), scale: 4.0 }];
  const [x, y, w, h] = face.box;
  const W = mat.cols, H = mat.rows;
  let real = 0;
  for (const { net, scale } of antiSpoof) {
    const s = Math.min(scale, (H - 1) / h, (W - 1) / w);
    const cw = w * s, ch = h * s;
    const left = Math.max(0, Math.min(x + w / 2 - cw / 2, W - cw));
    const top = Math.max(0, Math.min(y + h / 2 - ch / 2, H - ch));
    const rect = new cv.Rect(Math.round(left), Math.round(top), Math.max(1, Math.min(Math.round(cw), W - Math.round(left))), Math.max(1, Math.min(Math.round(ch), H - Math.round(top))));
    const crop = mat.roi(rect);
    const blob = cv.blobFromImage(crop, 1, new cv.Size(80, 80), new cv.Scalar(0, 0, 0), false, false);
    net.setInput(blob);
    const out = net.forward();
    const scores = Array.from(out.data32F);
    const top3 = Math.max(...scores);
    const exps = scores.map((value) => Math.exp(value - top3));
    const sum = exps.reduce((total, value) => total + value, 0);
    real += exps[1] / sum / antiSpoof.length;
    crop.delete(); blob.delete(); out.delete();
  }
  return real;
}

function headPose(landmarks) {
  const [re, le, nose, rm, lm] = landmarks;
  const eyes = Math.hypot(le[0] - re[0], le[1] - re[1]);
  const eyeY = (re[1] + le[1]) / 2, mouthY = (rm[1] + lm[1]) / 2;
  if (eyes < 1 || mouthY - eyeY < 1) return null;
  return { yaw: (nose[0] - (re[0] + le[0]) / 2) / eyes, pitch: (nose[1] - eyeY) / (mouthY - eyeY) };
}

// How colorful the middle 60% of the ID photo is: the mean of each pixel's max - min channel (0 for gray).
function colorfulness(mat) {
  const x0 = Math.floor(mat.cols * 0.2), x1 = Math.ceil(mat.cols * 0.8), y0 = Math.floor(mat.rows * 0.2), y1 = Math.ceil(mat.rows * 0.8);
  const data = mat.data;
  let total = 0, count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * mat.cols + x) * 3;
      const b = data[i], g = data[i + 1], r = data[i + 2];
      total += Math.max(r, g, b) - Math.min(r, g, b);
      count++;
    }
  }
  return count ? total / count : null;
}

async function analyze({ front, selfie }) {
  await opencv();
  const result = { idFaces: 0, selfieFaces: 0, similarity: null, pose: null, liveness: null, colorfulness: null };
  let idFace = null, idMat = null, selfieFace = null, selfieMat = null;
  try {
    if (front) {
      idMat = await bgr(front, 1024);
      result.colorfulness = colorfulness(idMat);
      // An ID's photo is small and printed: a lower bar, and the largest face (not the ghost portrait).
      const found = faces(idMat, 0.5);
      result.idFaces = found.length;
      idFace = found.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0] || null;
    }
    if (selfie) {
      selfieMat = await bgr(selfie, 640);
      const found = faces(selfieMat, 0.6);
      result.selfieFaces = found.length;
      selfieFace = found[0] || null;
      if (selfieFace) {
        result.pose = headPose(selfieFace.landmarks);
        result.liveness = liveness(selfieMat, selfieFace);
      }
    }
    if (idFace && selfieFace) {
      const a = embedding(idMat, idFace);
      const b = embedding(selfieMat, selfieFace);
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      result.similarity = dot;
    }
    return result;
  } finally {
    if (idMat) idMat.delete();
    if (selfieMat) selfieMat.delete();
  }
}

process.on('message', async (message) => {
  try {
    process.send({ id: message.id, ok: true, result: await analyze(message) });
  } catch (error) {
    const name = error && typeof error.name === 'string' ? error.name : 'Error';
    process.send({ id: message.id, ok: false, document: name === 'UnreadableImage' });
  }
});
process.on('disconnect', () => process.exit(0));
`;

/** The check went past its time or memory budget, or the engine failed (its process was killed or crashed). */
export class FaceEngineError extends Error {
  constructor(readonly why: 'time' | 'memory' | 'failed' | 'unreadable') {
    super(`The face check stopped (${why})`);
    this.name = 'FaceEngineError';
  }
}

let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function residentBytes(pid: number): number | null {
  try {
    const kilobytes = readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/status`, 'latin1').match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1];
    return kilobytes ? Number(kilobytes) * 1024 : null;
  } catch {
    return null;
  }
}

export interface FacePhotos {
  /** The ID's front (with its photo). */
  front: { bytes: Buffer } | null;
  /** The live selfie. */
  selfie: { bytes: Buffer } | null;
}

export interface FaceBudget {
  ms: number;
  memoryBytes: number;
}

/**
 * Runs the face checks in a fresh process, after any check already running in this server process, and kills it after.
 * Throws `FaceEngineError` past the budget, for a photo that won't open (`unreadable`) or when the engine fails.
 */
export function analyzeFaces(photos: FacePhotos, budget: FaceBudget = { ms: FACE_BUDGET_MS, memoryBytes: FACE_MEMORY_BYTES }): Promise<FaceFindings> {
  return oneAtATime(
    () =>
      new Promise<FaceFindings>((resolve, reject) => {
        const child = spawn(process.execPath, [`--max-old-space-size=${FACE_HEAP_MB}`, '-e', FACE_SOURCE], {
          cwd: process.cwd(),
          // Nothing of the server's but its mode and where the models are: no keys, no database address.
          env: { NODE_ENV: process.env.NODE_ENV, TNM_FACE_MODELS: modelsPath() },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          serialization: 'advanced',
        });
        try {
          if (child.pid !== undefined) setPriority(child.pid, 10);
        } catch {
          // Not allowed here: it runs at the server's priority.
        }
        let settled = false;
        const finish = (error: FaceEngineError | null, findings?: FaceFindings) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          clearInterval(watch);
          child.kill('SIGKILL');
          if (error) reject(error);
          else resolve(findings!);
        };
        const deadline = setTimeout(() => finish(new FaceEngineError('time')), budget.ms);
        const watch = setInterval(() => {
          const resident = child.pid === undefined ? null : residentBytes(child.pid);
          if (resident !== null && resident > budget.memoryBytes) finish(new FaceEngineError('memory'));
        }, 200);
        child.on('message', (message) => {
          const reply = message as { ok: true; result: FaceFindings } | { ok: false; document: boolean };
          if (reply.ok) finish(null, reply.result);
          else finish(new FaceEngineError(reply.document ? 'unreadable' : 'failed'));
        });
        child.on('error', () => finish(new FaceEngineError('failed')));
        child.on('exit', () => finish(new FaceEngineError('failed')));
        child.send({ id: 1, front: photos.front?.bytes ?? null, selfie: photos.selfie?.bytes ?? null }, (error) => {
          if (error) finish(new FaceEngineError('failed'));
        });
      }),
  );
}
