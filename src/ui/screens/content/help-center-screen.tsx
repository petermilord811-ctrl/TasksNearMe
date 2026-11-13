'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelpCenterData } from '@/contracts';
import { SupportCard } from '@/ui/components/content/support-card';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { Field, FieldDescription, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';

export function HelpCenterScreen({ data }: { data: HelpCenterData }) {
  const t = useTranslations('help');
  const [query, setQuery] = useState('');
  const searchId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');
  const topics = data.topics.map((topic) => ({ ...topic, articles: topic.articles.filter((article) => `${article.title} ${article.summary}`.toLocaleLowerCase('en-US').includes(normalizedQuery)) })).filter((topic) => topic.articles.length > 0);
  const resultCount = topics.reduce((count, topic) => count + topic.articles.length, 0);

  return <div className="mx-auto max-w-reading space-y-section">
    <PageHeader title={t('title')} description={t('description')} />
    <div className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <Field>
        <FieldLabel htmlFor={searchId}>{t('searchLabel')}</FieldLabel>
        <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-5 text-muted-foreground" /><Input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby={`${searchId}-hint`} placeholder={t('searchPlaceholder')} className="pl-10" /></div>
        <FieldDescription id={`${searchId}-hint`}>{t('searchHint')}</FieldDescription>
      </Field>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground tabular-nums">{t('results', { count: resultCount })}</p>
    {topics.length ? topics.map((topic) => <div key={topic.slug} id={topic.slug} className="scroll-mt-6"><Section title={topic.title} description={topic.description}>
      <ul className="divide-y rounded-[1.375rem] border border-foreground/[0.07] bg-card px-card shadow-card dark:border-white/[0.06]">{topic.articles.map((article) => <li key={article.slug}>
        <Link href={routes.help(article.slug)} className="group flex min-h-11 items-start gap-4 rounded-md py-4">
          <div className="min-w-0 flex-1"><h3 className="text-[17px] leading-6 font-semibold text-primary underline-offset-4 group-hover:underline lg:text-lg">{article.title}</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">{article.summary}</p></div><ArrowRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-x-1 motion-reduce:transform-none" />
        </Link>
      </li>)}</ul>
    </Section></div>) : <div className="space-y-2 rounded-[1.375rem] border border-dashed border-foreground/15 bg-card/70 p-card dark:border-white/[0.12]"><h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t('emptyTitle')}</h2><p className="text-muted-foreground">{t('emptyDescription')}</p></div>}
    <SupportCard />
  </div>;
}
