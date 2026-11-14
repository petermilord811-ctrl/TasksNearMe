import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { localeOrDefault, routes } from '@/contracts';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { submitPublicSupportAction } from '@/modules/support/public-actions';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { PageSkeleton } from '@/ui/components';
import { HelpContactScreen } from '@/ui/screens/content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.helpContact');
  return publicPageMetadata({ path: routes.helpContact(), title: t('title'), description: t('description') });
}

/**
 * Support for people who aren't signed in (completion plan 5.22): it opens a case keyed by the address typed,
 * answered by email. The bot check reads the request, so the form renders inside Suspense.
 */
async function HelpContactPage() {
  const [context, help, t] = await Promise.all([structuredDataContext(), getTranslations('server.meta.help'), getTranslations('server.meta.helpContact')]);
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: help('title'), path: routes.help() },
            { name: t('title'), path: routes.helpContact() },
          ]),
        ]}
      />
      <Suspense fallback={<PageSkeleton variant="form" />}>
        <HelpContact />
      </Suspense>
    </>
  );
}

async function HelpContact() {
  const [locale, botCheck] = await Promise.all([getLocale(), botCheckForPage()]);
  return <HelpContactScreen data={botCheck ? { botCheck } : {}} handlers={{ onSubmit: submitPublicSupportAction.bind(null, localeOrDefault(locale)) }} />;
}

export default withClientMessages('[locale]/(public)/help/contact/page.tsx', HelpContactPage);
