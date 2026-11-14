import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/contracts';
import { getHelpCenterData } from '@/modules/content/loaders';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { HelpCenterScreen } from '@/ui/screens/content/help-center-screen';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.help');
  return publicPageMetadata({ path: routes.help(), title: t('title'), description: t('description') });
}

async function HelpCenterPage() {
  const [locale, context, t] = await Promise.all([getLocale(), structuredDataContext(), getTranslations('server.meta.help')]);
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: t('title'), path: routes.help() },
          ]),
        ]}
      />
      <HelpCenterScreen data={getHelpCenterData(localeOrDefault(locale))} />
    </>
  );
}

export default withClientMessages('[locale]/(public)/help/page.tsx', HelpCenterPage);
