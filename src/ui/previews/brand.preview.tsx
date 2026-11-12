import { useTranslations } from 'next-intl';
import type { PreviewEntry } from '@/contracts/preview';
import { duration, easing, spring, stagger } from '@/ui/motion';
import { BrandMark, Logo, Wordmark } from '@/ui/shells/logo';
import messages from '../../../messages/en/ui/brand.json';

const palettes = ['light', 'dark'] as const;
const swatchGroups = [
  ['surface', ['background', 'foreground', 'card', 'muted', 'muted-foreground', 'border', 'brand-paper']],
  ['action', ['primary', 'primary-foreground', 'primary-hover', 'secondary', 'violet', 'violet-soft', 'accent', 'ring']],
  ['light', ['iri-1', 'iri-2', 'iri-3', 'iri-4']],
  ['categories', ['cat-furniture-assembly', 'cat-moving-help', 'cat-yard-cleanup', 'cat-light-cleaning', 'cat-computer-help']],
  ['status', ['success', 'warning', 'info', 'destructive', 'reward']],
] as const;

function LogoPreview() {
  const t = useTranslations('brand');
  return <div className="space-y-6">
    <h2 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t('identity')}</h2>
    <p className="max-w-prose text-muted-foreground">{t('logoDescription')}</p>
    <div className="grid gap-4 sm:grid-cols-2">{palettes.map((theme) => <section key={theme} data-theme={theme} className="space-y-8 rounded-3xl border bg-background p-6 text-foreground">
      <h3 className="text-sm font-medium text-muted-foreground">{t(theme)}</h3>
      <div className="flex flex-col items-start gap-6">
        <Logo />
        <span aria-hidden="true" className="flex items-center gap-3 sm:gap-4"><BrandMark className="size-12 sm:size-16" /><Wordmark className="text-[2rem] sm:text-5xl" /></span>
      </div>
    </section>)}</div>
  </div>;
}

function MarkPreview() {
  const t = useTranslations('brand');
  return <div className="grid gap-4 sm:grid-cols-2">{palettes.map((theme) => <section key={theme} data-theme={theme} className="rounded-3xl border bg-background p-6 text-foreground">
    <h2 className="mb-8 text-sm font-medium text-muted-foreground">{t(theme)}</h2>
    <div className="flex flex-wrap items-end gap-8">{([[16, 'size-4'], [32, 'size-8'], [64, 'size-16']] as const).map(([size, className]) => <div key={size} className="space-y-4"><BrandMark className={className} /><p className="text-sm tabular-nums">{t('markSize', { size })}</p></div>)}</div>
  </section>)}</div>;
}

function PalettePreview() {
  const t = useTranslations('brand');
  return <div className="space-y-6"><p className="max-w-prose text-muted-foreground">{t('paletteDescription')}</p>{palettes.map((theme) => <section key={theme} data-theme={theme} className="space-y-6 rounded-3xl border bg-background p-5 text-foreground">
    <h2 className="font-display text-2xl font-semibold">{t(theme)}</h2>
    <div className="h-14 rounded-2xl" style={{ backgroundImage: 'var(--iridescent)' }} />
    {swatchGroups.map(([group, tokens]) => <div key={group} className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{t(`groups.${group}`)}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">{tokens.map((token) => <div key={token} className="min-w-0 space-y-2">
        <div className="h-14 rounded-xl border" style={{ background: `var(--${token})` }} />
        <code className="block text-xs break-all">{`--${token}`}</code>
      </div>)}</div>
    </div>)}
  </section>)}</div>;
}

function TypePreview() {
  const t = useTranslations('brand');
  const examples = [
    ['page', 'pageHeading', 'font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl'],
    ['section', 'sectionHeading', 'font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl'],
    ['card', 'cardHeading', 'font-display text-[17px] font-semibold md:text-lg'],
    ['body', 'body', 'text-base leading-relaxed sm:text-lg'],
    ['small', 'small', 'text-sm leading-5'],
    ['caption', 'caption', 'text-xs leading-4'],
  ] as const;
  return <div className="space-y-8">
    <p className="max-w-prose text-muted-foreground">{t('typeDescription')}</p>
    <section className="space-y-3 border-t pt-5">
      <h2 className="text-xs font-medium text-muted-foreground">{t('scale.display')}</h2>
      <p className="max-w-[16ch] font-display text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.94] font-semibold tracking-[-0.045em] [font-stretch:94%]">
        {t('display')} <span className="font-accent font-normal tracking-[-0.02em] text-violet italic">{t('accent')}</span>.
      </p>
    </section>
    <section className="space-y-3 border-t pt-5">
      <h2 className="text-xs font-medium text-muted-foreground">{t('scale.accent')}</h2>
      <p className="font-accent text-5xl text-violet italic">{t('accent')}</p>
    </section>
    {examples.map(([scale, sample, className]) => <section key={scale} className="space-y-3 border-t pt-5">
      <h2 className="text-xs font-medium text-muted-foreground">{t(`scale.${scale}`)}</h2>
      <p className={className}>{t(sample)}</p>
    </section>)}
  </div>;
}

/** A cubic-bezier drawn as a curve: time across, progress up. */
function EasingCurve({ points }: { points: readonly [number, number, number, number] }) {
  const [x1, y1, x2, y2] = points;
  return <svg viewBox="-4 -4 108 108" className="size-24 shrink-0 overflow-visible rounded-2xl bg-muted" aria-hidden="true">
    <path d="M0 100 L100 100 M0 100 L0 0" stroke="var(--border)" strokeWidth="1.5" fill="none" />
    <path d={`M0 100 C${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`} stroke="var(--violet)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  </svg>;
}

function MotionPreview() {
  const t = useTranslations('brand');
  const maxDuration = duration.slower;
  return <div className="space-y-10">
    <p className="max-w-prose text-muted-foreground">{t('motionDescription')}</p>
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{t('durations')}</h2>
      <ul className="space-y-3">{(Object.keys(duration) as (keyof typeof duration)[]).map((name) => <li key={name} className="grid gap-2 sm:grid-cols-[16rem_1fr] sm:items-center">
        <span className="text-sm">{t(`durationNames.${name}`)}</span>
        <span className="flex items-center gap-3">
          <span className="h-2.5 rounded-full" style={{ width: `${(duration[name] / maxDuration) * 100}%`, backgroundImage: 'var(--iridescent)' }} />
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{t('durationValue', { ms: duration[name] })}</span>
        </span>
      </li>)}</ul>
    </section>
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{t('easings')}</h2>
      <ul className="grid gap-4 sm:grid-cols-2">{(Object.keys(easing) as (keyof typeof easing)[]).map((name) => <li key={name} className="flex items-center gap-4 rounded-3xl border bg-card p-4">
        <EasingCurve points={easing[name]} />
        <span className="space-y-1">
          <span className="block text-sm">{t(`easingNames.${name}`)}</span>
          <code className="block text-xs text-muted-foreground">{`cubic-bezier(${easing[name].join(', ')})`}</code>
        </span>
      </li>)}</ul>
    </section>
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{t('springs')}</h2>
      <ul className="grid gap-4 sm:grid-cols-2">{(Object.keys(spring) as (keyof typeof spring)[]).map((name) => <li key={name} className="space-y-1 rounded-3xl border bg-card p-4">
        <span className="block text-sm">{t(`springNames.${name}`)}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{t('springValue', { stiffness: spring[name].stiffness, damping: spring[name].damping, mass: spring[name].mass })}</span>
      </li>)}</ul>
    </section>
    <section className="space-y-2">
      <h2 className="font-display text-2xl font-semibold">{t('stagger')}</h2>
      <p className="text-sm text-muted-foreground tabular-nums">{t('staggerValue', { ms: stagger })}</p>
    </section>
  </div>;
}

export const brandPreviews: PreviewEntry[] = [
  { id: 'component-brand/logo', group: messages.group, title: messages.titles.logo, render: () => <LogoPreview /> },
  { id: 'component-brand/mark', group: messages.group, title: messages.titles.mark, render: () => <MarkPreview /> },
  { id: 'component-brand/palette', group: messages.group, title: messages.titles.palette, render: () => <PalettePreview /> },
  { id: 'component-brand/type', group: messages.group, title: messages.titles.type, render: () => <TypePreview /> },
  { id: 'component-brand/motion', group: messages.group, title: messages.titles.motion, render: () => <MotionPreview /> },
];
