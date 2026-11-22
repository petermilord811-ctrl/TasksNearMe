'use client';

import { useEffect, useState } from 'react';
import { opensKeyboard } from '@/ui/shells/mobile-bottom-nav';

/**
 * Whether a phone's keyboard is up: a text field has focus on a touch-first device (the same rule as the tab dock's,
 * `MobileBottomNav`). Settles on the next frame, so moving from one field to the next doesn't flash.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      setOpen(touch && opensKeyboard(document.activeElement));
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', settle);
    return () => {
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', settle);
      cancelAnimationFrame(frame);
    };
  }, []);
  return open;
}
