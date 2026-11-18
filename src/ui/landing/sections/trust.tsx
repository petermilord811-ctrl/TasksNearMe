import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Banknote, CheckCheck, CreditCard, LockKeyhole, MapPin, ShieldCheck, Star, UserRound } from 'lucide-react';
import { routes } from '@/contracts';
import { HoverLift, Reveal } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { ArrowLink, Heading } from './heading';

/**
 * Built-in trust: the four promises, each with a small picture of how it works that comes alive on hover (the
 * ID check's badge pops and a scan sweeps across, the area circle breathes while the exact address stays
 * locked, the payment moves from booking to approval to the helper, both reviews unblur together). The pictures
 * are decorative; each card's text says the same thing.
 */
export function TrustSection() {
  const t = useTranslations('landing.trust');
  const art = useTranslations('landing.trust.art');
  const cards: { key: 'verified' | 'address' | 'payment' | 'reviews'; Icon: typeof BadgeCheck; glow: string; span: string; picture: ReactNode }[] = [
    { key: 'verified', Icon: BadgeCheck, glow: 'var(--violet)', span: 'lg:col-span-7', picture: <IdPicture idCheck={art('idCheck')} backgroundCheck={art('backgroundCheck')} /> },
    { key: 'address', Icon: LockKeyhole, glow: 'var(--iri-1)', span: 'lg:col-span-5', picture: <AreaPicture area={art('generalArea')} exact={art('exactAddress')} /> },
    { key: 'payment', Icon: ShieldCheck, glow: 'var(--iri-3)', span: 'lg:col-span-5', picture: <PaymentPicture pay={art('pay')} approve={art('approve')} paid={art('paid')} /> },
    { key: 'reviews', Icon: Star, glow: 'var(--reward)', span: 'lg:col-span-7', picture: <ReviewsPicture client={art('client')} helper={art('helper')} rule={art('reviewsRule')} /> },
  ];
  return (
    <section id="trust" aria-labelledby="trust-title" className="scroll-mt-24 py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Heading id="trust-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {cards.map(({ key, Icon, glow, span, picture }, index) => (
            <li key={key} className={span}>
              <Reveal index={index} className="h-full">
                <HoverLift className="h-full" surfaceClassName="lift-shadow rounded-3xl border border-foreground/[0.07] bg-card/75" glow={glow} tilt={2.5}>
                  <div className="flex h-full flex-col p-5 sm:p-6">
                    <div aria-hidden="true" className="relative h-44 overflow-hidden rounded-2xl border border-foreground/[0.05] bg-foreground/[0.025]">{picture}</div>
                    <h3 className="mt-6 flex items-center gap-3 font-display text-lg font-semibold tracking-[-0.02em]">
                      <span className="lift-icon grid size-10 shrink-0 place-items-center rounded-xl bg-violet-soft text-violet"><Icon aria-hidden="true" className="size-5" /></span>
                      {t(`${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`${key}.body`)}</p>
                  </div>
                </HoverLift>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal className="mt-8">
          <ArrowLink href={routes.trustAndSafety()}>{t('link')}</ArrowLink>
        </Reveal>
      </div>
    </section>
  );
}

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border border-foreground/[0.07] bg-card px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-foreground/80 shadow-[0_6px_14px_-10px_rgb(0_0_0/0.45)]', className)}>{children}</span>;
}

/** An ID card being checked: a badge pops on, a scan sweeps across while it's pointed at. */
function IdPicture({ idCheck, backgroundCheck }: { idCheck: string; backgroundCheck: string }) {
  return (
    // Centered with flex (a grid's auto column grew to the card's 320 px, so on a phone it ran past the frame), and
    // on a phone nearly the frame's width, so the tags fit; a longer one (Spanish) wraps inside the card.
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="trust-id relative w-80 max-w-[calc(100%-1.5rem)]">
        <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-card p-3.5 shadow-[0_16px_34px_-20px_rgb(0_0_0/0.5)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full text-white" style={{ backgroundImage: 'var(--iridescent)' }}><UserRound className="size-5" /></span>
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-2 w-4/5 rounded-full bg-foreground/15" />
              <span className="block h-2 w-1/2 rounded-full bg-foreground/10" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag className="rounded-xl whitespace-normal"><BadgeCheck className="size-3.5 shrink-0 text-violet" />{idCheck}</Tag>
            <Tag className="rounded-xl whitespace-normal"><ShieldCheck className="size-3.5 shrink-0 text-violet" />{backgroundCheck}</Tag>
          </div>
          <span className="trust-scan" />
        </div>
        <span className="trust-badge absolute -top-2.5 -right-2.5 grid size-9 place-items-center rounded-full bg-violet text-white shadow-[0_8px_18px_-8px_var(--violet)]"><BadgeCheck className="size-5" /></span>
      </div>
    </div>
  );
}

/** A few streets and a park, the task's general area as a circle, and the exact address locked away. */
function AreaPicture({ area, exact }: { area: string; exact: string }) {
  return (
    <>
      <svg className="absolute inset-0 size-full" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
        <path d="M-10 118 C 60 104, 120 126, 190 108 S 290 84, 340 96" fill="none" stroke="currentColor" strokeWidth="9" className="text-foreground/[0.07]" strokeLinecap="round" />
        <path d="M70 -10 L 96 170" stroke="currentColor" strokeWidth="5" className="text-foreground/[0.06]" />
        <path d="M228 -10 L 210 170" stroke="currentColor" strokeWidth="5" className="text-foreground/[0.06]" />
        <path d="M-10 42 L 330 30" stroke="currentColor" strokeWidth="4" className="text-foreground/[0.05]" />
        <path d="M250 120 C 270 100, 310 104, 318 130 C 322 152, 280 160, 262 150 C 246 142, 240 132, 250 120 Z" className="fill-[color-mix(in_oklab,var(--success,#22a06b)_14%,transparent)]" />
        <circle cx="160" cy="76" r="46" className="trust-area fill-[color-mix(in_oklab,var(--violet)_11%,transparent)] stroke-[var(--violet)]" strokeWidth="1.6" strokeDasharray="5 5" />
        <circle cx="160" cy="76" r="3.5" className="fill-[var(--violet)] opacity-60" />
      </svg>
      <Tag className="trust-chip absolute top-3 left-3"><MapPin className="size-3.5 text-violet" />{area}</Tag>
      <Tag className="trust-chip absolute right-3 bottom-3"><LockKeyhole className="size-3.5 text-muted-foreground" />{exact}</Tag>
    </>
  );
}

/** Booked and paid, approved, then the helper is paid: the line fills and a dot runs along it. */
function PaymentPicture({ pay, approve, paid }: { pay: string; approve: string; paid: string }) {
  const nodes = [
    { label: pay, Icon: CreditCard },
    { label: approve, Icon: CheckCheck },
    { label: paid, Icon: Banknote },
  ];
  return (
    <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-6">
      <div className="relative">
        <span className="absolute top-5 right-[12%] left-[12%] h-0.5 overflow-hidden rounded-full bg-foreground/10">
          <span className="trust-flow-fill absolute inset-0 origin-left rounded-full" style={{ backgroundImage: 'linear-gradient(90deg, var(--violet), var(--iri-3))' }} />
          <span className="trust-flow-dot" />
        </span>
        <ol className="relative grid grid-cols-3 gap-2">
          {nodes.map(({ label, Icon }, index) => (
            <li key={label} className="flex flex-col items-center gap-2 text-center">
              <span className="trust-node grid size-10 place-items-center rounded-full border border-foreground/[0.08] bg-card text-violet shadow-[0_8px_18px_-12px_rgb(0_0_0/0.5)]" style={{ ['--node' as string]: index }}>
                <Icon className="size-4.5" />
              </span>
              <span className="text-xs leading-tight font-semibold text-foreground/75">{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Two reviews, blurred and locked until both are in; pointing at the card shows them together. */
function ReviewsPicture({ client, helper, rule }: { client: string; helper: string; rule: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
      <div className="relative flex items-start justify-center gap-3">
        {[client, helper].map((who, index) => (
          <div key={who} className={cn('trust-review w-36 rounded-2xl border border-foreground/[0.08] bg-card p-3 shadow-[0_12px_28px_-18px_rgb(0_0_0/0.5)]', index === 1 && 'mt-4')}>
            <span className="block text-xs font-semibold text-muted-foreground">{who}</span>
            <span className="mt-1.5 flex gap-0.5 text-reward">
              {[0, 1, 2, 3, 4].map((star) => <Star key={star} className="size-3.5" />)}
            </span>
            <span className="mt-2 block h-1.5 w-full rounded-full bg-foreground/10" />
            <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-foreground/10" />
          </div>
        ))}
        <span className="trust-lock absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-foreground/[0.08] bg-card text-foreground/70 shadow-[0_8px_18px_-10px_rgb(0_0_0/0.5)]"><LockKeyhole className="size-4" /></span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{rule}</span>
    </div>
  );
}
