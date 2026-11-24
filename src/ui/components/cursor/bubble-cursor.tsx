'use client';

import { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { startCursor } from './cursor-engine';
import './bubble-cursor.css';

/** Tip (2.5, 2.5); body center (12.5, 12.5), radius 8.5; the tail meets the body at 195° and 255° and curves in a little. */
const TAIL = 'M2.5 2.5 Q4.1 5.9 4.29 10.3 L10.3 4.29 Q5.9 4.1 2.5 2.5 Z';

/**
 * The Bubble cursor (2026-11-24): TasksNearMe's own pointer on computers with a mouse, mounted once in the root layout.
 * Hidden until the first mouse move puts it in place; the behavior is in cursor-engine.ts.
 */
export function BubbleCursor() {
  const t = useTranslations('cursor');
  const ref = useRef<HTMLDivElement>(null);
  const clipId = useId().replace(/:/g, '');
  const sheet = t('labels.sheet');
  const tab = t('labels.tab');
  const off = t('labels.off');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return startCursor(node, { sheet, tab, off });
  }, [sheet, tab, off]);

  return <div ref={ref} className="bcur" aria-hidden="true" hidden data-testid="bubble-cursor">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <defs><clipPath id={clipId}><circle cx="12.5" cy="12.5" r="8.5" /></clipPath></defs>
      <g className="bcur-motion"><g className="bcur-dir"><g className="bcur-shape">
        <g className="bcur-edge"><path d={TAIL} /><rect className="bcur-body" x="4" y="4" width="17" height="17" rx="8.5" ry="8.5" /></g>
        <g className="bcur-fill"><path d={TAIL} /><rect className="bcur-body" x="4" y="4" width="17" height="17" rx="8.5" ry="8.5" /></g>
        <g clipPath={`url(#${clipId})`}><ellipse className="bcur-shine" cx="9.6" cy="9.6" rx="2" ry="6.8" transform="rotate(45 9.6 9.6)" /></g>
        <circle className="bcur-mark bcur-spin" cx="12.5" cy="12.5" r="4.3" pathLength={100} />
        <path className="bcur-mark bcur-check" d="M9.3 12.8 L11.6 15.1 L15.8 10.6" pathLength={12} />
        <path className="bcur-mark bcur-tab" d="M9.9 15.1 L15.1 9.9 M11.2 9.9 H15.1 V13.8" />
        <g className="bcur-mark bcur-sheet" style={{ strokeWidth: 1.4 }}><rect x="8.6" y="9.2" width="7.8" height="6.6" rx="1.4" /><path d="M13.4 9.2 V15.8" /></g>
        <g className="bcur-mark bcur-off" style={{ strokeWidth: 1.5 }}><circle cx="12.5" cy="12.5" r="3.6" /><path d="M10 15 L15 10" /></g>
        <g className="bcur-mark bcur-dots"><circle cx="9.7" cy="12.5" r="1.1" /><circle cx="12.5" cy="12.5" r="1.1" /><circle cx="15.3" cy="12.5" r="1.1" /></g>
      </g></g></g>
    </svg>
    <span className="bcur-label" data-bcur-label="" />
  </div>;
}
