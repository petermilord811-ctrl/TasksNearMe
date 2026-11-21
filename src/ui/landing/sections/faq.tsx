import { useTranslations } from 'next-intl';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/primitives/accordion';
import { Reveal } from '@/ui/motion';
import { Heading } from './heading';

/**
 * Good to know: one question open at a time, each a card of its own. Opening one grows it smoothly to its
 * answer and closing shrinks it back (`landing-faq` in landing.css); the open one rises a little.
 */
export function FaqSection() {
  const t = useTranslations('landing.faq');
  const keys = ['pay', 'address', 'verified', 'rebook', 'helper'] as const;
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 py-12 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-content gap-10 px-gutter lg:grid-cols-[1fr_1.4fr]">
        <Heading id="faq-title" eyebrow={t('eyebrow')} title={t('title')} body={t('body')} />
        <Reveal index={1}>
          <Accordion type="single" collapsible className="landing-faq space-y-3">
            {keys.map((key) => (
              <AccordionItem key={key} value={key} className="faq-item rounded-2xl border border-foreground/[0.07] bg-card/70 px-5 last:border-b sm:px-6">
                <AccordionTrigger className="min-h-16 items-center py-4 text-left text-base font-semibold hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0 [&>svg]:duration-500 [&>svg]:ease-[var(--ease-out)]">
                  {t(`${key}.question`)}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{t(`${key}.answer`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
