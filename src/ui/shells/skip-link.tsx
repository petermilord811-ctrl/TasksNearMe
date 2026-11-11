import { useTranslations } from 'next-intl';

export function SkipLink() {
  const t = useTranslations('shell');
  return <a href="#main" className="sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-md focus:bg-card focus:px-4 focus:py-3 focus:whitespace-normal focus:shadow-overlay focus:[clip:auto]">{t('skipLink')}</a>;
}
