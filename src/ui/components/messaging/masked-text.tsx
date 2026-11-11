import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import type { MessageSegment } from '@/contracts';
import { cn } from '@/ui/lib/utils';

export interface MaskedTextProps {
  segments: MessageSegment[];
  className?: string;
}

/** Render the app's projection verbatim; the UI never detects or reconstructs contact details. */
export function MaskedText({ segments, className }: MaskedTextProps) {
  const t = useTranslations('location');

  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((segment, index) => segment.kind === 'text' ? (
        <Fragment key={index}>{segment.text}</Fragment>
      ) : (
        <span key={index} className="rounded bg-muted px-1 py-0.5 text-muted-foreground">
          {segment.detail === 'email'
            ? t('masked.email')
            : segment.hint
              ? t('masked.phone', { hint: segment.hint })
              : t('masked.phoneWithoutHint')}
        </span>
      ))}
    </span>
  );
}
