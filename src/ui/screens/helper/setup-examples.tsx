'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Lightbulb, RotateCcw, Shuffle } from 'lucide-react';
import type { CategorySlug, LanguageCode } from '@/contracts';
import { Button } from '@/ui/primitives/button';

/** The written examples' voices (plan 9.11), offered in this order. */
export const EXAMPLE_VARIANTS = ['plain', 'careful', 'neighbor'] as const;
type Variant = (typeof EXAMPLE_VARIANTS)[number];

const HEADLINE_MAX = 80;

export interface ExampleFacts {
  firstName: string;
  services: CategorySlug[];
  /** The neighborhood (or, elsewhere, the city) the helper works from. */
  area: string;
  languages: LanguageCode[];
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

const capitalize = (text: string, locale: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/** Cuts a too-long headline at a word, keeping it inside the profile's 80 characters. */
function fitHeadline(text: string): string {
  if (text.length <= HEADLINE_MAX) return text;
  const cut = text.slice(0, HEADLINE_MAX + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–-]+$/, '');
}

/**
 * Written examples of a headline and an "about me" (plan 9.11: help without Claude), in the page's language, filled
 * in with the helper's first name, the services they chose and their area. Copy only: the profile's own rules still
 * check what gets saved.
 */
export function buildExamples(facts: ExampleFacts, t: Translate, categoryName: (slug: CategorySlug) => string, locale: string): { headline: string; bio: string }[] {
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  const names = facts.services.map((slug) => categoryName(slug).toLocaleLowerCase(locale));
  const short = names.length <= 2 ? list.format(names) : t('andMore', { services: names.slice(0, 2).join(', ') });
  const all = list.format(names);
  const sentences = facts.services.slice(0, 3).map((slug) => t(`services.${slug}`));
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
  const spoken = facts.languages.map((code) => languageNames.of(code) ?? code);
  return EXAMPLE_VARIANTS.map((variant: Variant) => {
    const headline = facts.area ? t(`headlines.${variant}`, { services: short, area: facts.area }) : short;
    const intro = t(`intros.${variant}`, { name: facts.firstName, area: facts.area, services: all });
    const paragraphs = [[intro, ...sentences].join(' '), ...(spoken.length > 1 ? [t('languages', { languages: list.format(spoken) })] : []), t(`closings.${variant}`)];
    return { headline: fitHeadline(capitalize(headline, locale)), bio: paragraphs.join('\n\n') };
  });
}

/**
 * "Start from an example": fills the headline and "about me" with one of the written examples, then the next one;
 * Undo puts back what was there. Nothing is saved until the helper saves.
 */
export function ExamplesPanel({ facts, disabled, onUse, onUndo }: {
  facts: ExampleFacts;
  disabled?: boolean;
  onUse: (draft: { headline: string; bio: string }) => void;
  onUndo: () => void;
}) {
  const t = useTranslations('helperOnboarding.setup.examples');
  const categoryName = useTranslations('helperCard.categories');
  const locale = useLocale();
  const id = useId();
  const [index, setIndex] = useState<number | null>(null);
  const [undone, setUndone] = useState(false);
  const ready = facts.services.length > 0;

  function use() {
    const examples = buildExamples(facts, (key, values) => t(key, values), (slug) => categoryName(slug), locale);
    const next = index === null ? 0 : (index + 1) % examples.length;
    setIndex(next);
    setUndone(false);
    onUse(examples[next]!);
  }

  return <div role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="space-y-3 rounded-2xl border border-dashed border-foreground/15 bg-accent/40 p-4 dark:border-white/15">
    <p id={`${id}-title`} className="flex items-center gap-2 font-medium"><Lightbulb aria-hidden="true" className="size-4 text-primary" />{t('title')}</p>
    <p id={`${id}-description`} className="text-sm text-muted-foreground">{ready ? t('description') : t('needServices')}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled || !ready} onClick={use}>
        {index === null ? <Lightbulb aria-hidden="true" /> : <Shuffle aria-hidden="true" />}
        {t(index === null ? 'use' : 'another')}
      </Button>
      {index !== null && !undone && <Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => { onUndo(); setUndone(true); setIndex(null); }}>
        <RotateCcw aria-hidden="true" />{t('undo')}
      </Button>}
    </div>
    <p aria-live="polite" className="text-sm text-muted-foreground">{index !== null ? t('used', { number: index + 1, total: EXAMPLE_VARIANTS.length }) : undone ? t('undone') : ''}</p>
  </div>;
}
