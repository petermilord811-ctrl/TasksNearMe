'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { startCursorMotion } from './cursor-motion';
import './bubble-cursor.generated.css';
import './bubble-cursor.css';

/**
 * The Bubble cursor (2026-11-24): TasksNearMe's own pointer on computers with a mouse, mounted once in the root layout.
 * The cursors are images set by CSS (there from the first paint, drawn by the system, so they never lag); this starts
 * the few moments that move (cursor-motion.ts).
 */
export function BubbleCursor() {
  const t = useTranslations('cursor');
  const sheet = t('labels.sheet');
  const tab = t('labels.tab');
  const off = t('labels.off');

  useEffect(() => startCursorMotion({ sheet, tab, off }), [sheet, tab, off]);

  return null;
}
