import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CategorySeoContent, RelatedLink } from '@/contracts';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { Section } from '@/ui/components/layout/section';

/**
 * What a category page adds for people arriving from search (docs/seo/PLAN.md S3). Everything arrives ready in the
 * page's language (CategorySeoContent); these sections only lay it out.
 */

/** "12 verified helpers · 5 open tasks": only the counts above zero; nothing at all when both are zero. */
export function CategoryCounts({ seo }: { seo: CategorySeoContent }) {
  const t = useTranslations('publicPages.category.seo');
  const parts = [
    ...(seo.helperCount > 0 ? [t('helpers', { count: seo.helperCount })] : []),
    ...(seo.openTaskCount > 0 ? [t('openTasks', { count: seo.openTaskCount })] : []),
  ];
  if (parts.length === 0) return null;
  return <p className="mt-3 text-sm text-muted-foreground tabular-nums">{parts.join(' · ')}</p>;
}

/** The city guide for the service, when one is written in this language. */
export function CategoryAbout({ seo, market }: { seo: CategorySeoContent; market: string }) {
  const t = useTranslations('publicPages.category.seo');
  if (!seo.about) return null;
  return <Section title={t('aboutTitle', { market })}><div className="max-w-reading"><ContentBlocks blocks={seo.about} headingLevel={3} /></div></Section>;
}

/** Questions people ask, as rows that open in place (no script needed). */
export function CategoryFaq({ seo }: { seo: CategorySeoContent }) {
  const t = useTranslations('publicPages.category.seo');
  if (seo.faq.length === 0) return null;
  return <Section title={t('faqTitle')}>
    <div className="divide-y rounded-[1.375rem] border border-foreground/[0.07] bg-card px-card shadow-card dark:border-white/[0.06]">
      {seo.faq.map((entry) => (
        <details key={entry.question} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 [&::-webkit-details-marker]:hidden">
            <h3 className="font-semibold">{entry.question}</h3>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="max-w-reading pb-4 text-muted-foreground">{entry.answer}</p>
        </details>
      ))}
    </div>
  </Section>;
}

/** Links to the city's other services, its open tasks and pricing. */
export function CategoryRelated({ seo, market }: { seo: CategorySeoContent; market: string }) {
  return <RelatedLinks links={seo.related} market={market} />;
}

/** "More in Austin": a plain list of links, each a full-height tap target. */
export function RelatedLinks({ links, market }: { links: readonly RelatedLink[]; market: string }) {
  const t = useTranslations('publicPages.category.seo');
  if (links.length === 0) return null;
  return <Section title={t('relatedTitle', { market })}>
    <ul className="grid gap-x-8 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline">{link.label}</Link>
        </li>
      ))}
    </ul>
  </Section>;
}
