import { describe, expect, it } from 'vitest';
import { authorRole, communityLimits, helpfulMilestone, initialsOf, isSafetyOrCrimePost, milesBetween } from './domain';

describe('community rules', () => {
  it('limits accounts in their first week more tightly', () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(communityLimits(new Date('2026-11-14T15:00:00.000Z'), now).posts.limit).toBe(2);
    expect(communityLimits(new Date('2026-10-01T15:00:00.000Z'), now).posts.limit).toBe(8);
  });

  it('tells the author at 1, 5 and 25 Helpful, once each', () => {
    expect(helpfulMilestone(0, 1)).toBe(1);
    expect(helpfulMilestone(1, 2)).toBeNull();
    expect(helpfulMilestone(4, 5)).toBe(5);
    expect(helpfulMilestone(24, 25)).toBe(25);
    expect(helpfulMilestone(25, 26)).toBeNull();
  });

  it('labels people by what they do here', () => {
    expect(authorRole({ activeHelper: true, hasPostedTask: true })).toBe('helper');
    expect(authorRole({ activeHelper: false, hasPostedTask: true })).toBe('poster');
    expect(authorRole({ activeHelper: false, hasPostedTask: false })).toBe('neighbor');
  });

  it('spots posts about crime or suspicious people, in English and Spanish, and leaves ordinary words alone', () => {
    for (const text of ['Suspicious person on Elm', 'Another break-in last night', 'Porch pirates again', 'Hubo un robo en mi calle', 'Persona sospechosa en el parque']) expect(isSafetyOrCrimePost(text), text).toBe(true);
    for (const text of ['Who can fix my robot vacuum?', 'Recommend a mover for Saturday', 'Is the robotics club open?']) expect(isSafetyOrCrimePost(text), text).toBe(false);
  });

  it('makes initials and measures miles', () => {
    expect(initialsOf('Maya R.')).toBe('MR');
    expect(initialsOf('Lee')).toBe('L');
    expect(milesBetween({ lat: 30.2993, lng: -97.7036 }, { lat: 30.3479, lng: -97.7254 })).toBeCloseTo(3.6, 0);
  });
});
