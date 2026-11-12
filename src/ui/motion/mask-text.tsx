import { Fragment, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * Lines that slide up through a mask, one after another, on first paint (pure CSS: it never waits for
 * JavaScript, and reduced motion shows the text at once). Each entry is one line; wrap a word in your own
 * span to color it.
 */
export function MaskLines({ lines, className, lineClassName, delay = 80, step = 110 }: { lines: ReactNode[]; className?: string; lineClassName?: string; delay?: number; step?: number }) {
  return (
    <span className={cn('block', className)}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {/* A space between lines, so the text reads as words (it collapses between block lines). */}
          {index > 0 && ' '}
          <span className={cn('mask-line', lineClassName)}>
            <span style={{ ['--line-delay' as string]: `${delay + index * step}ms` }}>{line}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}
