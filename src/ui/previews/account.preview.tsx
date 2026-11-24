import { routes, type AccountHandlers, type AccountPageData, type AppShellHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import { accountSignInNotices, contactRevertPages, deletionWaitingPrivacy, exportReadyPrivacy, samplePushSetup, fakeAccountHandlers, fakeContactRevertHandlers, fakeHandler, fakeUnsubscribeHandlers, heldAccountData, jordanAccountData, jordanAskAlertsOffData, jordanShell, mayaAccountData, mayaShell, newAccountData, publicViewer, unsubscribePages } from '@/fixtures';
import { AccountScreen } from '@/ui/screens/account/account-screen';
import { ContactRevertContent } from '@/ui/screens/account/contact-revert-screen';
import { EmailUnsubscribeScreen } from '@/ui/screens/account/email-unsubscribe-screen';
import { PublicShell } from '@/ui/shells/public-shell';
import { AppShell } from '@/ui/shells/app-shell';
import { AccountInteractionPreview, type AccountPreviewInteraction } from './account-examples';
import copy from '../../../messages/en/ui/account.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(variant: string, title: string, data: AccountPageData = mayaAccountData, viewer: SignedInViewer = mayaShell, handlers: AccountHandlers = fakeAccountHandlers, action?: AccountPreviewInteraction, initialDialog?: { channel: 'email' | 'phone'; sentTo?: string }): PreviewEntry {
  const { photo } = data.profile;
  return {
    id: `screen-account/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={{ ...viewer, displayName: data.profile.displayName, initials: data.profile.initials, ...(photo ? { photo } : {}) }} handlers={shellHandlers} currentPath={routes.app.account()}>
      <AccountInteractionPreview action={action} triggerLabel={triggerLabels[action ?? 'button']} confirmationLabel={copy.privacy.confirmDelete} typed={typedValues[action ?? 'button']}>
        <AccountScreen data={data} handlers={handlers} initialDialog={initialDialog} />
      </AccountInteractionPreview>
    </AppShell>,
  };
}

/** The button each interaction presses (by its text or accessible name). */
const triggerLabels: Partial<Record<AccountPreviewInteraction, string>> = {
  button: copy.privacy.requestExport,
  deletion: copy.privacy.delete,
  'email-in-use': copy.contact.changeEmailLabel,
};
/** What each interaction types. */
const typedValues: Partial<Record<AccountPreviewInteraction, string>> = {
  'email-in-use': 'taken@example.test',
  'code-wrong': '000000',
};

export const accountPreviews: PreviewEntry[] = [
  preview('client', copy.previews.client),
  preview('helper', copy.previews.helper, jordanAccountData, jordanShell),
  preview('ask-alerts-off', copy.previews.askAlertsOff, jordanAskAlertsOffData, jordanShell),
  preview('export-ready', copy.previews.exportReady, { ...jordanAccountData, privacy: exportReadyPrivacy }, jordanShell),
  preview('push-device', copy.previews.pushDevice, { ...mayaAccountData, push: samplePushSetup }),
  preview('deletion-waiting', copy.previews.deletionWaiting, { ...newAccountData, privacy: deletionWaitingPrivacy }, { ...mayaShell, unreadMessages: 0, unreadNotifications: 0 }),
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
  preview('photo-uploading', copy.previews.photoUploading, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onUploadPhoto: () => new Promise(() => undefined),
  }, 'photo'),
  preview('photo-error', copy.previews.photoError, mayaAccountData, mayaShell, {
    ...fakeAccountHandlers, onUploadPhoto: async () => ({ ok: false, code: 'too_large' }),
  }, 'photo'),
  preview('email-change', copy.previews.emailChange, mayaAccountData, mayaShell, fakeAccountHandlers, undefined, { channel: 'email', sentTo: 'maya.rivera@example.test' }),
  preview('email-in-use', copy.previews.emailInUse, mayaAccountData, mayaShell, fakeAccountHandlers, 'email-in-use'),
  preview('phone-add', copy.previews.phoneAdd, newAccountData, { ...mayaShell, unreadMessages: 0, unreadNotifications: 0 }, fakeAccountHandlers, undefined, { channel: 'phone' }),
  preview('phone-code-wrong', copy.previews.phoneCodeWrong, mayaAccountData, mayaShell, fakeAccountHandlers, 'code-wrong', { channel: 'phone', sentTo: '(512) 555-0199' }),
  preview('contact-held', copy.previews.contactHeld, heldAccountData),
  ...([
    ['confirm', copy.previews.unsubscribeConfirm],
    ['unsubscribed', copy.previews.unsubscribeDone],
    ['locked', copy.previews.unsubscribeLocked],
    ['invalid', copy.previews.unsubscribeInvalid],
  ] as const).map(([state, title]): PreviewEntry => ({
    id: `screen-email-unsubscribe/${state}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath="/email/unsubscribe"><EmailUnsubscribeScreen data={unsubscribePages[state]} handlers={fakeUnsubscribeHandlers} /></PublicShell>,
  })),
  // The "Not you?" link in a contact change notice (completion plan 5.23).
  ...([
    ['ask', copy.previews.notMeAsk, contactRevertPages.ask, {}],
    ['done', copy.previews.notMeDone, contactRevertPages.ask, { initialStep: 'done' }],
    ['invalid', copy.previews.notMeInvalid, contactRevertPages.invalid, {}],
    ['rate-limited', copy.previews.notMeRateLimited, contactRevertPages.ask, { initialResult: { ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:05:00.000Z' } }],
  ] as const).map(([variant, title, data, seed]): PreviewEntry => ({
    id: `screen-contact-revert/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath="/account/not-me"><ContactRevertContent data={data} handlers={fakeContactRevertHandlers} {...seed} /></PublicShell>,
  })),
];
