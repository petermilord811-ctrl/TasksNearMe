import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { routes, type MentionSegment, type MessageSegment } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

export interface MaskedTextProps {
  segments: MessageSegment[];
  /** People named by @username link to them; off where the text sits inside a link already (a conversation's row). */
  links?: boolean;
  /**
   * Where no booking ever shows the details (a building or street group, 2026-11-24): they read "(hidden)", never
   * "hidden until booking".
   */
  always?: boolean;
  className?: string;
}

/** A person: their name in the text's own color (contrast on every bubble), underlined in the brand's color. */
const mentionClass = 'font-semibold text-current underline decoration-primary/70 decoration-2 underline-offset-2';

/**
 * Someone's @username in a message (2026-11-23): their name, which opens their profile when they help, else a
 * conversation with them (the chat window takes it on wide screens). Never the handle as typed.
 */
function Mention({ segment, links }: { segment: MentionSegment; links: boolean }) {
  const t = useTranslations('thread.mention');
  const label = `@${segment.name}`;
  const href = segment.self ? undefined : segment.helperHandle ? routes.helperProfile(segment.helperHandle) : routes.app.newMessage({ userId: segment.userId });
  if (!links || !href) return <span className="font-semibold">{label}</span>;
  return <Link href={href} title={segment.helperHandle ? t('profile', { name: segment.name }) : t('message', { name: segment.name })} className={cn(mentionClass, 'rounded-sm hover:decoration-primary focus-visible:outline-2 focus-visible:outline-ring')}>{label}</Link>;
}

/** Render the app's projection verbatim; the UI never detects or reconstructs contact details. */
export function MaskedText({ segments, links = true, always = false, className }: MaskedTextProps) {
  const t = useTranslations('location');

  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((segment, index) => segment.kind === 'text' ? (
        <Fragment key={index}>{segment.text}</Fragment>
      ) : segment.kind === 'mention' ? (
        <Mention key={index} segment={segment} links={links} />
      ) : (
        <span key={index} className="rounded bg-muted px-1 py-0.5 text-muted-foreground">
          {segment.detail === 'email'
            ? (always ? t('maskedAlways.email') : t('masked.email'))
            : segment.detail === 'link'
              ? (always ? t('maskedAlways.link') : t('masked.link'))
              : segment.detail === 'handle'
                ? (always ? t('maskedAlways.handle') : t('masked.handle'))
                : segment.hint
                  ? (always ? t('maskedAlways.phone', { hint: segment.hint }) : t('masked.phone', { hint: segment.hint }))
                  : (always ? t('maskedAlways.phoneWithoutHint') : t('masked.phoneWithoutHint'))}
        </span>
      ))}
    </span>
  );
}
