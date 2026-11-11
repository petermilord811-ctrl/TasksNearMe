/**
 * Phrases that block posting in every category (blueprint 01 §6.1, legal/prohibited-tasks).
 * Categories add their own (`categories.prohibited_keywords`). Matching is whole-word.
 */
export const GLOBAL_PROHIBITED_PHRASES = [
  'firearm',
  'firearms',
  'gun',
  'guns',
  'ammunition',
  'babysit',
  'babysitting',
  'childcare',
  'child care',
  'pet sitting',
  'dog walking',
  'drive me',
  'give me a ride',
  'crypto wallet',
  'bank login',
  'social security number',
  'asbestos',
  'roof',
] as const;
