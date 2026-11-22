'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { Highlight } from './highlight';

/**
 * A card's words, folded after four lines with "More" (plan 10.2: Nextdoor's "See more" instead of a hard cut). The
 * button shows only when the words don't fit, measured in the browser; before that the text is just folded.
 */
export function ExpandableText({ text, className, words = [] }: { text: string; className?: string; /** A search's words, marked. */ words?: readonly string[] }) {
  const t = useTranslations('community');
  const id = useId();
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => setOverflows(node.scrollHeight - node.clientHeight > 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return <div>
    <p ref={box} id={id} className={cn('whitespace-pre-line [overflow-wrap:anywhere]', !open && 'line-clamp-4', className)}><Highlight text={text} words={words} /></p>
    {(overflows || open) && <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="mt-0.5 min-h-8 rounded-sm text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {open ? t('less') : t('moreText')}
    </button>}
  </div>;
}
