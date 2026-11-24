'use client';

import { useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Copy, Languages, Reply } from 'lucide-react';
import { MESSAGE_REACTIONS, type MessageReaction } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { PopoverContent } from '@/ui/primitives/popover';
import { REACTION_EMOJI } from './reply-context';

/**
 * Reactions as in a messenger (2026-11-23, owner: "Emojis are bug now … make it animated and also easy to use as telegram
 * emoji reaction"): no row of emoji under every message any more. On wide screens a small React button comes up beside the
 * bubble under the pointer; on phones a long press opens the picker, with Reply, Translate and Copy, and a double tap sends
 * a heart. The picker's emoji rise in turn and grow under the pointer; a chosen one pops in under the message with a
 * little burst.
 */

/** The ones the picker shows first; the rest come with "more". */
export const QUICK_REACTIONS: readonly MessageReaction[] = MESSAGE_REACTIONS.slice(0, 7);

/** The picker's content (in a Popover anchored to the bubble): the emoji, then, on phones, the message's other actions. */
export function ReactionPicker({ chosen, onPick, actions, label, onCloseFocus, reactionsOff = false }: {
  /** Which of them the viewer already gave (picking one again takes it back). */
  chosen: (emoji: MessageReaction) => boolean;
  onPick(emoji: MessageReaction): void;
  /** Reply, Translate, Copy: shown in the picker on touch screens, where there's no hover row. */
  actions?: ReactNode;
  label: string;
  /** Where focus goes back when it closes (the React button it opened from; none after a long press). */
  onCloseFocus?: () => HTMLElement | null;
  /** No reactions here (a closed conversation): only the actions. */
  reactionsOff?: boolean;
}) {
  const t = useTranslations('thread.reactions');
  const [all, setAll] = useState(false);
  const shown = all ? MESSAGE_REACTIONS : QUICK_REACTIONS;
  const row = useRef<HTMLDivElement>(null);
  // Arrow keys move between the emoji (a toolbar), Home and End to the ends.
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowLeft' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (next === null || buttons.length === 0) return;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };
  return <PopoverContent side="top" align="center" sideOffset={6} collisionPadding={8} aria-label={label} onCloseAutoFocus={(event) => {
    // Opened by state (no trigger): focus goes back to the React button by hand, or stays where the long press was.
    event.preventDefault();
    onCloseFocus?.()?.focus();
  }} className="w-auto max-w-[calc(100vw-1rem)] rounded-[1.75rem] p-1.5 shadow-[0_18px_40px_-14px_rgb(40_20_5/0.45)]">
    {!reactionsOff && <div ref={row} role="toolbar" aria-label={label} aria-orientation="horizontal" onKeyDown={keys} className={cn('flex items-center gap-0.5', all && 'flex-wrap justify-center')} style={all ? { maxWidth: '15.5rem' } : undefined}>
      {shown.map((emoji, index) => <button key={emoji} type="button" aria-pressed={chosen(emoji)} aria-label={t(emoji)} title={t(emoji)} onClick={() => onPick(emoji)}
        className={cn('reaction-choice reaction-rise grid size-[2.4rem] place-items-center rounded-full text-[1.5rem] leading-none transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-ring', chosen(emoji) && 'bg-brand-soft')}
        style={{ ['--rise-delay' as string]: `${index * 28}ms` }}>
        <span aria-hidden="true">{REACTION_EMOJI[emoji]}</span>
      </button>)}
      {!all && <button type="button" onClick={() => setAll(true)} aria-label={t('more')} title={t('more')} className="reaction-rise grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" style={{ ['--rise-delay' as string]: `${shown.length * 28}ms` }}>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>}
    </div>}
    {actions && <div className={cn('flex flex-wrap justify-center gap-1', !reactionsOff && 'mt-1 border-t border-foreground/[0.07] pt-1 dark:border-white/[0.08]')}>{actions}</div>}
  </PopoverContent>;
}

/** One of the picker's actions on touch screens (Reply, Translate, Copy). */
export function PickerAction({ icon, label, onSelect }: { icon: 'reply' | 'translate' | 'copy'; label: string; onSelect(): void }) {
  const Icon = icon === 'reply' ? Reply : icon === 'translate' ? Languages : Copy;
  return <button type="button" onClick={onSelect} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-ring">
    <Icon aria-hidden="true" className="size-4" />{label}
  </button>;
}

/** The little burst around a reaction that was just added (decorative). */
export function ReactionBurst() {
  return <span aria-hidden="true" className="reaction-burst">
    {[0, 60, 120, 180, 240, 300].map((angle) => <i key={angle} style={{ ['--burst-angle' as string]: `${angle}deg` }} />)}
  </span>;
}

const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 300;
const MOVE_TOLERANCE = 10;

/**
 * Touch gestures on the bubbles of a conversation: a long press opens a bubble's picker, a double tap on the same one sends
 * a heart. Mouse and pen keep their usual clicks and text selection (the hover row is theirs). One state for the whole
 * log: `bind(id)` gives a bubble its handlers.
 */
export function useBubbleGestures({ onLongPress, onDoubleTap }: { onLongPress(id: string): void; onDoubleTap(id: string): void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ id: string; x: number; y: number } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const pressed = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      pressed.current = false;
      start.current = { id, x: event.clientX, y: event.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pressed.current = true;
        start.current = null;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
        onLongPress(id);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!start.current) return;
      if (Math.abs(event.clientX - start.current.x) > MOVE_TOLERANCE || Math.abs(event.clientY - start.current.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      const wasTap = start.current !== null && start.current.id === id && !pressed.current;
      cancel();
      if (!wasTap) return;
      const now = Date.now();
      if (lastTap.current && lastTap.current.id === id && now - lastTap.current.at < DOUBLE_TAP_MS) {
        lastTap.current = null;
        onDoubleTap(id);
      } else lastTap.current = { id, at: now };
    },
    onPointerCancel: cancel,
    // The phone's own menu would open on the same long press.
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => { if (pressed.current) event.preventDefault(); },
  });
}
