import { Eye, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BookingFamilyView } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * A booking conversation's family line (2026-11-24), under its header: for the helper and the client, who follows
 * ("Maya's family member Lia follows this booking": the helper always sees it); for a follower, that they're reading
 * it read-only, and whose messages are on the right. Names only, never anyone's contact details.
 */
export function FamilyNote({ family, compact = false, className }: { family?: BookingFamilyView; compact?: boolean; className?: string }) {
  const t = useTranslations('family');
  if (!family) return null;
  // Only the client gets the panel to manage followers.
  const viewer = family.following ? 'follower' : family.manage ? 'client' : 'helper';
  const box = cn('flex items-start gap-2 text-muted-foreground', compact ? 'border-b border-foreground/[0.07] bg-muted/40 px-3 py-1.5 text-xs dark:border-white/[0.06]' : 'rounded-2xl bg-secondary/50 px-4 py-2 text-sm', className);
  if (family.following) {
    return <p role="note" data-family-note="following" className={box}><Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{t('note.following', { client: family.following.clientName })}</span></p>;
  }
  const notice = family.followedBy;
  if (!notice || viewer === 'follower') return null;
  const names = notice.names.join(' · ');
  return <p role="note" data-family-note={viewer} className={box}>
    <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
    <span>{viewer === 'client' ? t('note.client', { names, count: notice.names.length }) : t('note.helper', { client: notice.clientName, names, count: notice.names.length })}</span>
  </p>;
}
