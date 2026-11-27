'use client';

import { useEffect, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { Check, Clock, X } from 'lucide-react';
import type { CheckOutcome } from '@/contracts';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';

/** One line of a document's checks: still running, or its outcome. `note`: the second line ("Our team will look"). */
export interface FlowCheckRow {
  key: string;
  label: string;
  outcome: CheckOutcome | 'pending';
  note?: string;
}

/** How long apart finished checks turn over, one after another, when they arrive together. */
const STEP_MS = 220;

/**
 * The checks of a document, as a list that fills in: while the server reads, every line spins; when the answers come,
 * they turn over one by one from the top (a pass pops a check mark in), so the person sees each one land. Lines that
 * don't apply (`skipped`) aren't shown. With reduced motion everything shows at once.
 */
export function CheckList({ rows, label }: { rows: FlowCheckRow[]; label: string }) {
  const reduced = usePrefersReducedMotion();
  const shown = rows.filter((row) => row.outcome !== 'skipped');
  const settled = shown.filter((row) => row.outcome !== 'pending').length;
  // How many lines from the top have turned over; it catches up with `settled` one step at a time.
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (reduced || revealed >= settled) return;
    const timer = setTimeout(() => setRevealed((count) => count + 1), revealed === 0 ? 120 : STEP_MS);
    return () => clearTimeout(timer);
  }, [reduced, revealed, settled]);
  const turned = reduced ? shown.length : revealed;
  return <LazyMotion features={domAnimation}>
    <ul aria-label={label} className="divide-y divide-foreground/[0.06] rounded-2xl border bg-card">
      {shown.map((row, index) => {
        const outcome = row.outcome === 'pending' || index >= turned ? 'pending' : row.outcome;
        return <li key={row.key} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <CheckMark outcome={outcome} reduced={reduced} />
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[0.9375rem] leading-5 transition-colors duration-300', outcome === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{row.label}</span>
            {row.note && outcome !== 'pending' && outcome !== 'pass' && <span className="block text-sm leading-5 text-muted-foreground">{row.note}</span>}
          </span>
          {/* The outcome in words for screen readers (the mark is a picture). */}
          <span className="sr-only">{outcome}</span>
        </li>;
      })}
    </ul>
  </LazyMotion>;
}

function CheckMark({ outcome, reduced }: { outcome: CheckOutcome | 'pending'; reduced: boolean }) {
  if (outcome === 'pending') {
    return <span aria-hidden="true" className={cn('size-6 shrink-0 rounded-full border-2 border-foreground/12 border-t-primary', !reduced && 'animate-spin')} />;
  }
  const look = {
    pass: 'bg-success text-white',
    fail: 'bg-destructive text-white',
    unsure: 'bg-foreground/[0.07] text-foreground/60',
    skipped: 'bg-foreground/[0.07] text-foreground/60',
  }[outcome];
  const Icon = outcome === 'pass' ? Check : outcome === 'fail' ? X : Clock;
  return <m.span
    aria-hidden="true"
    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
    className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', look)}
  >
    <Icon className="size-3.5" strokeWidth={outcome === 'pass' ? 3 : 2.5} />
  </m.span>;
}

/** The big check mark of a finished flow: the ring, then the tick, drawn in. */
export function SuccessMark() {
  const reduced = usePrefersReducedMotion();
  const draw = (length: number, delay: number) =>
    reduced ? undefined : ({ strokeDasharray: length, '--draw-length': length, animation: `draw 640ms var(--ease-out) ${delay}ms both` } as React.CSSProperties);
  return <span aria-hidden="true" className="relative flex size-20 items-center justify-center">
    {!reduced && <span className="absolute inset-0 rounded-full bg-success/25" style={{ animation: 'pulse-ring 900ms var(--ease-out) 380ms both' }} />}
    <svg viewBox="0 0 80 80" className="relative size-20">
      <circle cx="40" cy="40" r="36" fill="var(--success)" opacity="0.12" />
      <circle cx="40" cy="40" r="36" fill="none" stroke="var(--success)" strokeWidth="4" strokeLinecap="round" style={draw(227, 0)} transform="rotate(-90 40 40)" />
      <path d="M25 41.5 L35.5 52 L56 30" fill="none" stroke="var(--success)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={draw(48, 340)} />
    </svg>
  </span>;
}

/**
 * What's being read, while it's read: an ID card (or a document) with a light sweeping over it, gently, until the
 * answers come. Decorative: the heading and the list say what's happening.
 */
export function ScanIllustration({ kind }: { kind: 'identity' | 'address' }) {
  const reduced = usePrefersReducedMotion();
  const card = kind === 'identity';
  return <LazyMotion features={domAnimation}>
    <span aria-hidden="true" className="relative mx-auto block h-28 w-44">
      <span className={cn('absolute inset-0 m-auto overflow-hidden rounded-2xl border-2 border-foreground/15 bg-card shadow-card', card ? 'h-28 w-44' : 'h-28 w-24')}>
        {card
          ? <>
            <span className="absolute top-4 left-4 h-12 w-10 rounded-lg bg-foreground/[0.08]" />
            <span className="absolute top-5 right-4 left-18 h-2 rounded-full bg-foreground/[0.1]" />
            <span className="absolute top-10 right-8 left-18 h-2 rounded-full bg-foreground/[0.08]" />
            <span className="absolute top-15 right-12 left-18 h-2 rounded-full bg-foreground/[0.08]" />
            <span className="absolute right-4 bottom-4 left-4 h-3 rounded-sm bg-[repeating-linear-gradient(90deg,var(--foreground)_0_2px,transparent_2px_4px)] opacity-15" />
          </>
          : <>
            <span className="absolute top-4 left-3 h-2 w-8 rounded-full bg-primary/40" />
            <span className="absolute top-9 right-3 left-3 h-1.5 rounded-full bg-foreground/[0.1]" />
            <span className="absolute top-13 right-6 left-3 h-1.5 rounded-full bg-foreground/[0.08]" />
            <span className="absolute top-17 right-4 left-3 h-1.5 rounded-full bg-foreground/[0.08]" />
            <span className="absolute top-21 right-8 left-3 h-1.5 rounded-full bg-foreground/[0.08]" />
          </>}
        {!reduced && <m.span
          className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-primary/25 to-transparent"
          initial={{ top: '-40%' }}
          animate={{ top: ['-40%', '100%'] }}
          transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], repeat: Infinity, repeatDelay: 0.25 }}
        />}
      </span>
    </span>
  </LazyMotion>;
}
