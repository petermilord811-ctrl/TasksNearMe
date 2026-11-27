import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { routes, type AppShellHandlers, type CommunityPostHandlers, type PhoneVerifyHandlers, type PortalHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import {
  PORTAL_NOW,
  SERIES_NOW,
  communityPhotos,
  communityPostPageData,
  communityPostReplyBlockedData,
  fakeHandler,
  fakeOnboardingHandlers,
  fakeSeriesHandlers,
  jordanShell,
  mayaShell,
  onboardingAddressStep,
  onboardingIdentityCapture,
  onboardingPhoneStep,
  portalBlockedData,
  priyaShell,
  seriesClientNoSavedCardsData,
} from '@/fixtures';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
// The Neighbors rail's sponsored cards (the route imports these styles in the app).
import '@/ui/components/ads/ads.css';
import { PhoneVerifyDialog } from '@/ui/screens/account/account-contact';
import { CommunityPostDialog } from '@/ui/screens/community/community-post-screen';
import { PortalScreen } from '@/ui/screens/community/portal-screen';
import { HelperCheckDialogScreen } from '@/ui/screens/helper/helper-check-dialog';
import { SeriesScreen } from '@/ui/screens/series';
import { PageUnavailableScreen } from '@/ui/screens/system/page-unavailable-screen';
import { AppShell } from '@/ui/shells/app-shell';
import common from '../../../messages/en/ui/common.json';
import community from '../../../messages/en/ui/community.json';
import notFound from '../../../messages/en/ui/notFound.json';
import portal from '../../../messages/en/ui/portal.json';
import series from '../../../messages/en/ui/series.json';
import shell from '../../../messages/en/ui/shell.json';
import { ClickOnLoad } from './click-on-load';

/**
 * In place of a trip to another page (2026-11-23, owner: "I hate to redirect to new pages continually … if possible, use
 * dialog"): a Neighbors post over the feed, verifying a phone over Neighbors, a helper's phone and home address checks
 * over the page, adding a card inside the series' Change-card sheet, and what a page says when it can't open for the
 * account (it bounced to Home without a word).
 */
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const phoneHandlers: PhoneVerifyHandlers = { onStartPhoneChange: fakeHandler({ ok: true, code: 'sent' }), onConfirmPhoneChange: fakeHandler({ ok: true, code: 'updated' }) };
const postHandlers: CommunityPostHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onEdit: fakeHandler({ ok: true, code: 'updated' }),
  onFollow: fakeHandler({ ok: true, code: 'updated' }),
  onUploadPhoto: async () => ({ ok: true, photo: communityPhotos.shelf }),
  onLoadReactors: async () => ({ helpful: ['Priya S.', 'Nate O.', 'Ana P.'], thanks: ['Lee M.'] }),
  ...phoneHandlers,
};
const portalHandlers: PortalHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
  onPost: fakeHandler({ ok: true, code: 'sent' }),
  ...phoneHandlers,
};

/** The phone steps open over Neighbors, titled in the page's language as the button opens them. */
function VerifyPhoneOpen() {
  const t = useTranslations('community');
  return <PhoneVerifyDialog open onOpenChange={() => undefined} title={t('verifyPhoneTitle')} handlers={phoneHandlers} onVerified={() => undefined} />;
}

function dialog(id: string, name: string, viewer: SignedInViewer, under: string, screen: () => ReactNode): PreviewEntry {
  return {
    id: `route-dialog/${id}`, group: common.dialogPreviewsGroup, title: common.dialogPreviewTitle.replace('{name}', name), layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={under} layout="flow"><RouteDialogFrame>{screen()}</RouteDialogFrame></AppShell>,
  };
}

export const inPlacePreviews: PreviewEntry[] = [
  dialog('community-post', community.previews.postDialog, mayaShell, routes.app.community(), () => <CommunityPostDialog data={communityPostPageData} handlers={postHandlers} now={PORTAL_NOW} />),
  dialog('community-post-reply-blocked', community.previews.postDialogReplyBlocked, jordanShell, routes.app.community(), () => <CommunityPostDialog data={communityPostReplyBlockedData} handlers={postHandlers} now={PORTAL_NOW} />),
  dialog('helper-check-phone', shell.reminder.checkTitles.phone, priyaShell, routes.app.bookings(), () => <HelperCheckDialogScreen data={{ step: 'phone', verification: { ...onboardingPhoneStep.verification, phone: { verified: false } } }} handlers={fakeOnboardingHandlers} />),
  dialog('helper-check-address', shell.reminder.checkTitles.address, priyaShell, routes.app.bookings(), () => <HelperCheckDialogScreen data={{ step: 'address', verification: onboardingAddressStep.verification }} handlers={fakeOnboardingHandlers} />),
  dialog('helper-check-elsewhere', shell.reminder.checkTitles.address, priyaShell, routes.app.bookings(), () => <HelperCheckDialogScreen data={{ step: 'address', elsewhere: 'profile' }} handlers={fakeOnboardingHandlers} />),
  dialog('helper-check-identity', shell.reminder.checkTitles.identity, priyaShell, routes.app.helperVerification(), () => <HelperCheckDialogScreen data={{ step: 'identity', verification: onboardingIdentityCapture.verification }} handlers={fakeOnboardingHandlers} />),
  {
    id: 'screen-portal/verify-phone', group: portal.previews.group, title: community.previews.verifyPhoneDialog, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.community()}>
      <PortalScreen data={portalBlockedData} handlers={portalHandlers} now={PORTAL_NOW} />
      <VerifyPhoneOpen />
    </AppShell>,
  },
  {
    id: 'screen-portal/unavailable', group: portal.previews.group, title: notFound.unavailable.title, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.community()}><PageUnavailableScreen /></AppShell>,
  },
  {
    id: 'screen-series/client-add-card', group: series.previews.group, title: series.previews['client-add-card'], layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.series(seriesClientNoSavedCardsData.series.id)}>
      <ClickOnLoad label={series.actions.change_card}><SeriesScreen data={seriesClientNoSavedCardsData} handlers={fakeSeriesHandlers} now={SERIES_NOW} /></ClickOnLoad>
    </AppShell>,
  },
];
