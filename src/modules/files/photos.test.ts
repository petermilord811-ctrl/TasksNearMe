import { describe, expect, it } from 'vitest';
import { AVATAR_PX, avatarPhoto, photoSrc, profilePhotoOf } from './photos';

describe('profile photos (plan 9.3)', () => {
  it('are served at 256 px from the stored 512 px square, named for their person', () => {
    expect(AVATAR_PX).toBe(512);
    expect(avatarPhoto('fil_abc', 'Maya R.')).toEqual({ id: 'fil_abc', src: '/api/files/fil_abc?w=256', alt: 'Maya R.', width: 256, height: 256 });
  });

  it('spread into a person summary only when the person added one', () => {
    expect(profilePhotoOf({ avatarFileId: null, name: 'Maya R.' })).toEqual({});
    expect({ id: 'usr_maya', ...profilePhotoOf({ avatarFileId: null, name: 'Maya R.' }) }).not.toHaveProperty('photo');
    expect(profilePhotoOf({ avatarFileId: 'fil_abc', name: 'Maya R.' })).toEqual({ photo: avatarPhoto('fil_abc', 'Maya R.') });
  });

  it('keep small images at their own size', () => {
    expect(photoSrc({ id: 'fil_small', width: 200, height: 150 }, 256)).toBe('/api/files/fil_small');
    expect(photoSrc({ id: 'fil_big', width: 2000, height: 1500 })).toBe('/api/files/fil_big?w=1280');
  });
});
