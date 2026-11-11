import type { ExactAddress, PublicLocation, RemoteLocation } from '@/contracts';

/** Public general area for the desk task: about a 1-mile circle around a fuzzed point in Mueller. */
export const muellerArea: PublicLocation = {
  kind: 'local',
  marketSlug: 'austin',
  marketName: 'Austin',
  areaName: 'Mueller',
  publicPoint: { lat: 30.2993, lng: -97.7036 },
  radiusMeters: 1609,
};

/** The same area as Jordan (a helper) sees it: with a distance band. */
export const muellerAreaForJordan: PublicLocation = { ...muellerArea, distanceBand: 'about-2-mi' };

/** Participants only. Fictional street. Privacy tests assert this text never leaks. */
export const deskExactAddress: ExactAddress = {
  line1: '1234 Example Lane',
  line2: 'Apt 2B',
  city: 'Austin',
  state: 'TX',
  zip: '78723',
  accessNotes: 'Buzz 2B. Elevator is on the left.',
};

export const remoteLocation: RemoteLocation = { kind: 'remote' };
