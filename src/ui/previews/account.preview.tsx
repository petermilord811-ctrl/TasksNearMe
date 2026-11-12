import { routes, type AccountHandlers, type AccountPageData, type AppShellHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import { accountSignInNotices, fakeAccountHandlers, fakeHandler, jordanAccountData, jordanShell, mayaAccountData, mayaShell, newAccountData } from '@/fixtures';
import { AccountScreen } from '@/ui/screens/account/account-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { AccountInteractionPreview, type AccountPreviewInteraction } from './account-examples';
import copy from '../../../messages/en/ui/account.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(variant: string, title: string, data: AccountPageData = mayaAccountData, viewer: SignedInViewer = mayaShell, handlers: AccountHandlers = fakeAccountHandlers, action?: AccountPreviewInteraction): PreviewEntry {
  return {
    id: `screen-account/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={{ ...viewer, displayName: data.profile.displayName, initials: `${data.profile.firstName[0]}${data.profile.lastName[0]}` }} handlers={shellHandlers} currentPath={routes.app.account()}>
      <AccountInteractionPreview action={action} triggerLabel={action === 'deletion' ? copy.privacy.delete : copy.privacy.requestExport} confirmationLabel={copy.privacy.confirmDelete}>
        <AccountScreen data={data} handlers={handlers} />
      </AccountInteractionPreview>
    </AppShell>,
  };
}

export const accountPreviews: PreviewEntry[] = [
  preview('client', copy.previews.client),
  preview('helper', copy.previews.helper, jordanAccountData, jordanShell),
  preview('new', copy.previews.new, newAccountData, { ...mayaShell, unreadMessages: 0, unreadNotifications: 0 }),
  preview('saving', copy.previews.saving, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onSaveProfile: fakeHandler({ ok: true, code: 'saved' }, 60_000),
  }, 'profile'),
  preview('validation-failed', copy.previews.validationFailed, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onSaveProfile: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { firstName: ['too_short'], lastName: ['invalid'] } }, 0),
  }, 'profile'),
  preview('deletion-blocked', copy.previews.deletionBlocked, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onRequestDeletion: fakeHandler({ ok: false, code: 'not_allowed' }, 0),
  }, 'deletion'),
  preview('sign-in-already-used', copy.previews.signInAlreadyUsed, accountSignInNotices.alreadyUsed),
  preview('sign-in-email-unconfirmed', copy.previews.signInEmailUnconfirmed, accountSignInNotices.emailUnconfirmed),
  preview('sign-in-cancelled', copy.previews.signInCancelled, accountSignInNotices.cancelled),
  preview('paused', copy.previews.paused, { ...jordanAccountData, helper: { status: 'paused' } }, jordanShell),
  preview('suspended', copy.previews.suspended, { ...jordanAccountData, helper: { status: 'suspended' } }, jordanShell),
  preview('preference-blocked', copy.previews.preferenceBlocked, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onSavePreference: fakeHandler({ ok: false, code: 'not_allowed' }, 0),
  }, 'preference'),
  preview('rate-limited', copy.previews.rateLimited, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onSaveProfile: fakeHandler({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:05:00.000Z' }, 0),
  }, 'profile'),
  preview('export-error', copy.previews.unknown, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onRequestExport: fakeHandler({ ok: false, code: 'unknown' }, 0),
  }, 'button'),
];
