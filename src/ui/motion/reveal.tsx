import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';
import { stagger as staggerMs } from './tokens';

export interface RevealProps {
  children: ReactNode;
  /** `rise`: fade, blur and rise. `bloom`: grows from `origin` (a card from its trigger). */
  variant?: 'rise' | 'bloom';
  /** Position in a staggered group (0-based), or an explicit delay in ms. */
  index?: number;
  delay?: number;
  /** For `bloom`: where it grows from, e.g. "50% 100%". */
  origin?: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * Reveals its content as it scrolls into view (once). It's only an attribute, so it works in server
 * components; `MotionRoot` decides whether it may animate. Without JavaScript or with reduced motion,
 * the content is simply there.
 */
export function Reveal({ children, variant = 'rise', index, delay, origin, as: Tag = 'div', className, style, id }: RevealProps) {
  const wait = delay ?? (index !== undefined ? index * staggerMs : 0);
  return (
    <Tag
      id={id}
      data-reveal={variant === 'bloom' ? 'bloom' : ''}
      className={cn(className)}
      style={{ ...style, ['--reveal-delay' as string]: `${wait}ms`, ...(origin ? { ['--bloom-origin' as string]: origin } : {}) }}
    >
      {children}
    </Tag>
  );
}
