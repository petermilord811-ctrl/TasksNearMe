'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether this page was opened signed in (2026-11-23). Only then can a failed action mean the session ended, so only
 * then does a form ask /api/session and say "You've been signed out" (J-N2, src/ui/components/forms/
 * connection-aware-text.tsx). The signed-in layouts provide it: (app)/app, admin's gated pages and the route dialogs over
 * /app. Sign-in, sign-up and public pages don't, because nobody is signed in there: a suspended account's code keeps its
 * own words ("This account can't continue.") instead of turning into "signed out" a moment later.
 */
const SignedInPageContext = createContext(false);

export function SignedInPage({ children }: { children: ReactNode }) {
  return <SignedInPageContext.Provider value>{children}</SignedInPageContext.Provider>;
}

export function useSignedInPage(): boolean {
  return useContext(SignedInPageContext);
}
