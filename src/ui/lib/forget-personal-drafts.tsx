'use client';

import { useEffect } from 'react';
import { forgetPersonalDrafts } from './personal-drafts';

/** On the sign-in and sign-up pages: whoever signs in next starts without the last person's drafts (personal-drafts.ts). */
export function ForgetPersonalDrafts() {
  useEffect(() => forgetPersonalDrafts(), []);
  return null;
}
