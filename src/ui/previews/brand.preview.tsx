import { useTranslations } from 'next-intl';
import type { PreviewEntry } from '@/contracts/preview';
import { BrandMark, Logo } from '@/ui/shells/logo';
import messages from '../../../messages/en/ui/brand.json';

const palettes = ['light', 'dark'] as const;
const swatches = [
  ['background', 'bg-background'], ['foreground', 'bg-foreground'],
  ['primary', 'bg-primary'], ['primary-foreground', 'bg-primary-foreground'],
  ['card', 'bg-card'], ['muted', 'bg-muted'], ['brand-soft', 'bg-brand-soft'],
  ['brand-paper', 'bg-brand-paper'], ['clay', 'bg-clay'], ['sun', 'bg-sun'],
  ['success', 'bg-success'], ['warning', 'bg-warning'], ['info', 'bg-info'],
  ['destructive', 'bg-destructive'], ['reward', 'bg-reward'], ['ring', 'bg-ring'],
] as const;

function LogoPreview() {
  const t = useTranslations('brand');
  return <div className="space-y-6">
    <h2 className="text-2xl font-semibold">{t('identity')}</h2>
    <p className="text-muted-foreground">{t('logoDescription')}</p>
    <div className="grid gap-4 sm:grid-cols-2">{palettes.map((theme) => <section key={theme} data-theme={theme} className="space-y-8 rounded-xl border bg-background p-6 text-foreground">
      <h3 className="font-sans text-sm font-medium text-muted-foreground">{t(theme)}</h3>
      <Logo />
    </section>)}</div>
  </div>;
}

function MarkPreview() {
  const t = useTranslations('brand');
  return <div className="grid gap-4 sm:grid-cols-2">{palettes.map((theme) => <section key={theme} data-theme={theme} className="rounded-xl border bg-background p-6 text-foreground">
    <h2 className="mb-8 font-sans text-sm font-medium text-muted-foreground">{t(theme)}</h2>
    <div className="flex flex-wrap items-end gap-8">{[[16, 'size-4'], [32, 'size-8'], [64, 'size-16']].map(([size, className]) => <div key={size} className="space-y-4"><BrandMark className={String(className)} /><p className="text-sm tabular-nums">{t('markSize', { size })}</p></div>)}</div>
  </section>)}</div>;
}

function PalettePreview() {
  const t = useTranslations('brand');
  return <div className="space-y-6"><p className="text-muted-foreground">{t('paletteDescription')}</p>{palettes.map((theme) => <section key={theme} data-theme={theme} className="rounded-xl border bg-background p-5 text-foreground">
    <h2 className="mb-5 text-2xl font-semibold">{t(theme)}</h2>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{swatches.map(([token, className]) => <div key={token} className="min-w-0 space-y-2"><div className={`h-16 rounded-lg border ${className}`} /><code className="break-all text-xs">{`--${token}`}</code></div>)}</div>
  </section>)}</div>;
}

function TypePreview() {
  const t = useTranslations('brand');
  const examples = [
    ['display', 'display', 'font-heading text-display'],
    ['page', 'pageHeading', 'font-heading text-2xl font-bold md:text-[30px]'],
    ['section', 'sectionHeading', 'font-heading text-xl font-semibold md:text-[22px]'],
    ['card', 'cardHeading', 'font-heading text-[17px] font-semibold md:text-lg'],
    ['body', 'body', 'text-base leading-6'],
    ['small', 'small', 'text-sm leading-5'],
    ['caption', 'caption', 'text-xs leading-4'],
  ] as const;
  return <div className="space-y-8"><p className="text-muted-foreground">{t('typeDescription')}</p>{examples.map(([scale, sample, className]) => <section key={scale} className="space-y-3 border-t pt-5">
    <h2 className="font-sans text-xs font-medium text-muted-foreground">{t(`scale.${scale}`)}</h2>
    <p className={className}>{t(sample)}</p>
  </section>)}</div>;
}

export const brandPreviews: PreviewEntry[] = [
  { id: 'component-brand/logo', group: messages.group, title: messages.titles.logo, render: () => <LogoPreview /> },
  { id: 'component-brand/mark', group: messages.group, title: messages.titles.mark, render: () => <MarkPreview /> },
  { id: 'component-brand/palette', group: messages.group, title: messages.titles.palette, render: () => <PalettePreview /> },
  { id: 'component-brand/type', group: messages.group, title: messages.titles.type, render: () => <TypePreview /> },
];
