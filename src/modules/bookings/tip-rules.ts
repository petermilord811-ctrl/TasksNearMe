import { TIP_RULES, type BookingViewerRole, type TipPreset } from '@/contracts';

/**
 * Tips (blueprint 01, P2): pure rules for when the client may tip and what the presets are. `tips.ts` charges and
 * records the tip; the booking page shows the card from `tipViewOf`.
 */

const DAY = 86_400_000;

/** Approved by the client, or automatically when the window ended. Support releases and settlements don't count. */
const APPROVED_VIA: readonly string[] = ['poster', 'auto'];

/** 10/15/20% of the final task price in whole dollars, between $1 and $200; an amount that repeats appears once. */
export function tipPresets(taskPriceCents: number): TipPreset[] {
  const presets: TipPreset[] = [];
  for (const percent of TIP_RULES.presetPercents) {
    const dollars = Math.round((Math.max(0, taskPriceCents) * percent) / 10_000);
    const amountCents = Math.min(TIP_RULES.maxCents, Math.max(TIP_RULES.minCents, dollars * 100));
    if (!presets.some((preset) => preset.amountCents === amountCents)) presets.push({ percent, amountCents });
  }
  return presets;
}

/** The last moment to tip: `windowDays` after the work was approved. */
export function tipWindowEndsAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + TIP_RULES.windowDays * DAY);
}

export interface TipFacts {
  status: string;
  completedVia: string | null;
  completedAt: Date | null;
  /** A tip already went through. */
  tipped: boolean;
}

/** Why this person can't tip now (null: they can). */
export type TipRefusal = 'not_client' | 'not_approved' | 'window_closed' | 'already_tipped';

export function tipRefusal(facts: TipFacts, role: BookingViewerRole, now: Date): TipRefusal | null {
  if (role !== 'poster') return 'not_client';
  if (facts.status !== 'completed' || !facts.completedAt || !APPROVED_VIA.includes(facts.completedVia ?? '')) return 'not_approved';
  if (now.getTime() >= tipWindowEndsAt(facts.completedAt).getTime()) return 'window_closed';
  if (facts.tipped) return 'already_tipped';
  return null;
}
