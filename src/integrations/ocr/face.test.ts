import { describe, expect, it } from 'vitest';
import { FACE_THRESHOLDS, headPose, judgeFaces, poseFollows, type FaceFindings } from './face';

/**
 * Judging the face engine's numbers. Landmarks as YuNet gives them: the person's right eye (on the photo's left), left
 * eye, nose tip, right and left mouth corners. The photo is never mirrored, so a head turned to the person's left moves
 * the nose toward the photo's right.
 */

const facing = [[100, 100], [160, 100], [130, 133], [108, 160], [152, 160]] as const;
const turnedLeft = [[100, 100], [160, 100], [145, 133], [108, 160], [152, 160]] as const;
const turnedRight = [[100, 100], [160, 100], [115, 133], [108, 160], [152, 160]] as const;
const lookingUp = [[100, 100], [160, 100], [130, 118], [108, 160], [152, 160]] as const;

const findings = (changes: Partial<FaceFindings> = {}): FaceFindings => ({
  idFaces: 1,
  selfieFaces: 1,
  similarity: 0.62,
  pose: headPose(turnedLeft),
  liveness: 0.98,
  colorfulness: 40,
  ...changes,
});

describe('the head pose', () => {
  it('reads facing, turned left, turned right and looking up from the landmarks', () => {
    expect(headPose(facing)).toEqual({ yaw: 0, pitch: 0.55 });
    expect(headPose(turnedLeft)!.yaw).toBeCloseTo(0.25);
    expect(headPose(turnedRight)!.yaw).toBeCloseTo(-0.25);
    expect(headPose(lookingUp)!.pitch).toBeCloseTo(0.3);
    expect(headPose([[0, 0]])).toBeNull();
  });

  it('says whether the pose follows the prompt, the other way round, or neither', () => {
    expect(poseFollows('look_left', headPose(turnedLeft)!)).toBe('followed');
    expect(poseFollows('look_left', headPose(turnedRight)!)).toBe('opposite');
    expect(poseFollows('look_left', headPose(facing)!)).toBe('unclear');
    expect(poseFollows('look_right', headPose(turnedRight)!)).toBe('followed');
    expect(poseFollows('look_up', headPose(lookingUp)!)).toBe('followed');
    expect(poseFollows('look_up', headPose(facing)!)).toBe('unclear');
    // A smile or three fingers: for our team's eyes.
    expect(poseFollows('smile', headPose(facing)!)).toBeNull();
  });
});

describe('judging the faces', () => {
  it('passes a matching, live selfie that followed its prompt', () => {
    expect(judgeFaces(findings(), 'look_left')).toEqual({
      faceMatch: 'pass',
      live: 'pass',
      signals: ['pose_followed'],
      photocopy: false,
      score: { similarity: 0.62, matchAt: FACE_THRESHOLDS.match, mismatchBelow: FACE_THRESHOLDS.mismatch },
      liveness: 0.98,
    });
  });

  it('fails a different face, leaves a weak match to our team', () => {
    expect(judgeFaces(findings({ similarity: 0.2 }), 'look_left')).toMatchObject({ faceMatch: 'fail', signals: expect.arrayContaining(['face_mismatch']) });
    expect(judgeFaces(findings({ similarity: 0.38 }), 'look_left')).toMatchObject({ faceMatch: 'unsure', signals: expect.arrayContaining(['face_weak_match']) });
  });

  it("fails a selfie that is the ID's own photo", () => {
    expect(judgeFaces(findings({ similarity: 0.95 }), 'look_left')).toMatchObject({ faceMatch: 'unsure', live: 'fail', signals: expect.arrayContaining(['selfie_is_id_photo']) });
  });

  it('leaves missing or extra faces, a turn the other way and a suspected spoof to our team', () => {
    expect(judgeFaces(findings({ idFaces: 0, similarity: null }), 'look_left')).toMatchObject({ faceMatch: 'unsure', signals: expect.arrayContaining(['id_face_missing']) });
    expect(judgeFaces(findings({ selfieFaces: 0, similarity: null, pose: null, liveness: null }), 'look_left')).toMatchObject({ faceMatch: 'unsure', live: 'unsure', signals: ['selfie_face_missing'] });
    expect(judgeFaces(findings({ selfieFaces: 2 }), 'look_left')).toMatchObject({ live: 'unsure', signals: expect.arrayContaining(['selfie_many_faces']) });
    expect(judgeFaces(findings({ pose: headPose(turnedRight) }), 'look_left')).toMatchObject({ live: 'unsure', signals: expect.arrayContaining(['pose_not_followed']) });
    expect(judgeFaces(findings({ liveness: 0.2 }), 'look_left')).toMatchObject({ live: 'unsure', signals: expect.arrayContaining(['spoof_suspected', 'pose_followed']) });
    expect(judgeFaces(findings(), 'three_fingers')).toMatchObject({ live: 'unsure' });
  });

  it('tells a black-and-white copy of an ID', () => {
    expect(judgeFaces(findings({ colorfulness: 2 }), 'look_left')).toMatchObject({ photocopy: true, signals: expect.arrayContaining(['photocopy']) });
    expect(judgeFaces(findings({ colorfulness: null }), 'look_left').photocopy).toBe(false);
  });
});
