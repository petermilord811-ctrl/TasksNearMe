import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { HelpChat, type HelpChatProps } from '@/ui/components/messaging/help-chat';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * `/app/messages/help` (2026-11-22): TasksNearMe Help on its own page, on phones (from the pinned row in Messages) and
 * from the chat window's "Open full page". One line on top, then the conversation filling the screen, as a
 * conversation's page does.
 */
export function HelpChatScreen(props: Omit<HelpChatProps, 'variant'>) {
  const t = useTranslations('chat.help');
  return <div className="mx-auto flex w-full max-w-reading flex-col gap-3">
    <header className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Link href={routes.app.messages()} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 size-11 shrink-0 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <h1 className="truncate font-display text-lg leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">{t('title')}</h1>
    </header>
    <div className="flex h-[max(26rem,calc(100dvh-var(--app-header-offset,4.25rem)-8rem))] flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card lg:h-[max(32rem,calc(100dvh-var(--app-header-offset,4.25rem)-10rem))] dark:border-white/[0.06]">
      <HelpChat {...props} variant="page" />
    </div>
  </div>;
}
