'use client';

import { useEffect, useState } from 'react';
import { fakeSignInHandlers, signInEmailCodeStep } from '@/fixtures';
import { SignInScreen } from '@/ui/screens/auth/sign-in-screen';

export function CountdownPreview() {
  const [at, setAt] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => setAt(new Date(Date.now() + 30000).toISOString()), 0);
    return () => clearTimeout(timer);
  }, []);
  return <SignInScreen data={{ ...signInEmailCodeStep, resendAvailableAt: at }} handlers={fakeSignInHandlers} />;
}
