import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CopyCodeScreen } from '@/ui/screens/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.copyCode');
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * The sign-in email's "Copy code" button opens this page (src/modules/accounts/emails/sign-in-code.ts). It's
 * static: the code and its expiry ride in the fragment, which the browser never sends, and the screen reads them.
 */
function CopyCodePage() {
  return <CopyCodeScreen />;
}

export default withClientMessages('[locale]/(public)/code/page.tsx', CopyCodePage);
