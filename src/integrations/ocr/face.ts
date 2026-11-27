import type { CheckOutcome, FaceMatchScore, IdSignal, LivenessPrompt } from '@/contracts';

/**
 * What the face engine's numbers mean (face-engine.ts measures, this judges): whether the selfie's face is the ID's, and
 * whether the selfie is of a live person who followed its instruction. Pure functions.
 *
 * Thresholds (cosine of SFace embeddings, 2026-11-27; to calibrate on pairs our team decides): OpenCV's 0.363 is tuned on
 * LFW, and a printed, laminated, years-old ID photo scores lower than two photos of a face, so there's a band in between
 * for our team. Two official portraits of one person years apart scored 0.80; two people 0.16–0.24.
 */
export const FACE_THRESHOLDS = {
  /** At or above: the same person. */
  match: 0.45,
  /** Below: not the same person. In between: unsure. */
  mismatch: 0.3,
  /** At or above: the selfie is a photo of the ID's own photo, not a new one. */
  sameImage: 0.92,
} as const;

/** The selfie's head pose, from the 5 landmarks of the face detector, in the photo as stored (never mirrored). */
export interface HeadPose {
  /** The nose's offset from between the eyes, in eye distances: positive when the head turns to the person's left. */
  yaw: number;
  /** Where the nose sits from the eyes (0) to the mouth (1): about 0.55 facing the camera, less looking up. */
  pitch: number;
}

/** The prompts a machine can check from the pose; the others (a smile, three fingers) are for our team's eyes. */
export const CHECKABLE_PROMPTS = ['look_left', 'look_right', 'look_up'] as const satisfies readonly LivenessPrompt[];

/** How far the head must turn: a quarter of the way from facing the camera to profile, about 20 degrees. */
const TURN = 0.12;
const LOOK_UP_BELOW = 0.42;

/** The face detector's landmarks: the person's right eye, left eye, nose tip, right and left mouth corners (x, y). */
export type Landmarks = readonly (readonly [number, number])[];

export function headPose(landmarks: Landmarks): HeadPose | null {
  const [rightEye, leftEye, nose, rightMouth, leftMouth] = landmarks;
  if (!rightEye || !leftEye || !nose || !rightMouth || !leftMouth) return null;
  const eyeDistance = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]);
  const eyeY = (rightEye[1] + leftEye[1]) / 2;
  const mouthY = (rightMouth[1] + leftMouth[1]) / 2;
  if (eyeDistance < 1 || mouthY - eyeY < 1) return null;
  return { yaw: (nose[0] - (rightEye[0] + leftEye[0]) / 2) / eyeDistance, pitch: (nose[1] - eyeY) / (mouthY - eyeY) };
}

/**
 * Whether the pose follows the prompt. `opposite`: turned the other way (a camera app may save the selfie mirrored, so
 * it goes to our team rather than failing). Null for a prompt the pose can't show.
 */
export function poseFollows(prompt: LivenessPrompt, pose: HeadPose): 'followed' | 'opposite' | 'unclear' | null {
  if (prompt === 'look_left') return pose.yaw >= TURN ? 'followed' : pose.yaw <= -TURN ? 'opposite' : 'unclear';
  if (prompt === 'look_right') return pose.yaw <= -TURN ? 'followed' : pose.yaw >= TURN ? 'opposite' : 'unclear';
  if (prompt === 'look_up') return pose.pitch < LOOK_UP_BELOW ? 'followed' : 'unclear';
  return null;
}

/** What the face engine found (numbers only: no image, no embedding). */
export interface FaceFindings {
  /** Faces on the ID's front (the largest is its photo; Florida cards also carry a small ghost portrait). */
  idFaces: number;
  selfieFaces: number;
  /** Cosine similarity of the ID's largest face and the selfie's most confident one; null when either is missing. */
  similarity: number | null;
  /** The selfie's head pose; null without a selfie face. */
  pose: HeadPose | null;
  /** How likely the selfie is of a live person, 0 to 1 (MiniFASNet V2 and V1SE averaged); null without the models or a face. */
  liveness: number | null;
  /** How colorful the middle of the ID's photo is (mean of each pixel's max − min channel, 0 to 255); null when not measured. */
  colorfulness: number | null;
}

/** Below this the ID's photo is black and white: a photocopy or printout, not a card. */
const PHOTOCOPY_BELOW = 6;
/** Below this the selfie looks like a photo of a photo or a screen (a hint for our team, never a decision). */
const SPOOF_BELOW = 0.5;

export interface FaceJudgement {
  faceMatch: CheckOutcome;
  live: CheckOutcome;
  signals: IdSignal[];
  /** The ID photo looks like a black-and-white copy (a sign against `genuine`). */
  photocopy: boolean;
  score?: FaceMatchScore;
  liveness?: number;
}

export function judgeFaces(findings: FaceFindings, prompt: LivenessPrompt): FaceJudgement {
  const signals: IdSignal[] = [];
  let faceMatch: CheckOutcome = 'unsure';
  let live: CheckOutcome = 'unsure';
  if (findings.idFaces === 0) signals.push('id_face_missing');
  if (findings.selfieFaces === 0) signals.push('selfie_face_missing');
  if (findings.selfieFaces > 1) signals.push('selfie_many_faces');
  const similarity = findings.similarity;
  const sameImage = similarity !== null && similarity >= FACE_THRESHOLDS.sameImage;
  if (similarity !== null && findings.idFaces > 0 && findings.selfieFaces > 0) {
    if (sameImage) signals.push('selfie_is_id_photo');
    else if (similarity >= FACE_THRESHOLDS.match) faceMatch = 'pass';
    else if (similarity < FACE_THRESHOLDS.mismatch) {
      faceMatch = 'fail';
      signals.push('face_mismatch');
    } else signals.push('face_weak_match');
  }
  const spoofed = findings.liveness !== null && findings.liveness < SPOOF_BELOW;
  if (spoofed) signals.push('spoof_suspected');
  if (sameImage) live = 'fail';
  else if (findings.selfieFaces === 1 && findings.pose) {
    const follows = poseFollows(prompt, findings.pose);
    if (follows === 'followed') signals.push('pose_followed');
    else if (follows !== null) signals.push('pose_not_followed');
    live = follows === 'followed' && !spoofed ? 'pass' : 'unsure';
  }
  const photocopy = findings.colorfulness !== null && findings.colorfulness < PHOTOCOPY_BELOW;
  if (photocopy) signals.push('photocopy');
  return {
    faceMatch,
    live,
    signals,
    photocopy,
    ...(similarity !== null ? { score: { similarity: Math.round(similarity * 1000) / 1000, matchAt: FACE_THRESHOLDS.match, mismatchBelow: FACE_THRESHOLDS.mismatch } } : {}),
    ...(findings.liveness !== null ? { liveness: Math.round(findings.liveness * 1000) / 1000 } : {}),
  };
}
