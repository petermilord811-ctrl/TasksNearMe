import type { ReactNode } from 'react';
import { routes, type ActionResult, type AppShellHandlers, type PreviewEntry, type SignInPageData } from '@/contracts';
import {
  adminBetaEmpty,
  adminBetaInviteOnly,
  adminBetaPage,
  adminBetaReadOnly,
  alexStaff,
  fakeAdminBetaHandlers,
  fakeHandler,
  fakeHelperInviteHandlers,
  fakeSignInHandlers,
  helperInvite,
  helperInvitePrefilled,
  helperInviteResults,
  morganStaff,
  priyaShell,
  publicViewer,
  signInInviteStep,
  signInInviteStepPrefilled,
  signInResults,
} from '@/fixtures';
import { AdminBetaScreen } from '@/ui/screens/admin';
import { InviteCodeStep, SignInScreen } from '@/ui/screens/auth';
import { SignInFrame } from '@/ui/screens/auth/sign-in-screen';
import { HelperInviteScreen } from '@/ui/screens/beta';
import { AdminShell } from '@/ui/shells/admin-shell';
import { AppShell } from '@/ui/shells/app-shell';
import { PublicShell } from '@/ui/shells/public-shell';
import adminCopy from '../../../messages/en/ui/adminBeta.json';
import copy from '../../../messages/en/ui/beta.json';

/** Private beta (B-068): the invite step at sign-up, the helper invite screen, and the staff page. */

const appShellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const adminShellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const p = copy.previews;
const a = adminCopy.previews;

function entry(id: string, title: string, group: string, render: () => ReactNode): PreviewEntry {
  return { id, title, group, layout: 'fullscreen', render };
}

const signUp = (data: SignInPageData, initialResult?: ActionResult) => <PublicShell viewer={publicViewer} currentPath={routes.signIn()}>
  {initialResult ? <SignInFrame><InviteCodeStep data={data} handlers={fakeSignInHandlers} initialResult={initialResult} /></SignInFrame> : <SignInScreen data={data} handlers={fakeSignInHandlers} />}
</PublicShell>;

const helper = (data = helperInvite, initialResult?: ActionResult) => <AppShell viewer={priyaShell} handlers={appShellHandlers} currentPath={routes.app.helperOnboarding()} layout="flow">
  <HelperInviteScreen data={data} handlers={fakeHelperInviteHandlers} {...(initialResult ? { initialResult } : {})} />
</AppShell>;

const admin = (data = adminBetaPage, lead = true) => <AdminShell viewer={lead ? morganStaff : alexStaff} handlers={adminShellHandlers} currentPath={routes.admin.beta()}>
  <AdminBetaScreen data={data} handlers={fakeAdminBetaHandlers} />
</AdminShell>;

export const betaPreviews: PreviewEntry[] = [
  entry('screen-sign-in/invite-code', p['sign-up'], p.group, () => signUp(signInInviteStep)),
  entry('screen-sign-in/invite-code-prefilled', p['sign-up-prefilled'], p.group, () => signUp(signInInviteStepPrefilled)),
  entry('sign-in-step/invite-incorrect', p['sign-up-incorrect'], p.group, () => signUp(signInInviteStep, signInResults.inviteIncorrect)),
  entry('sign-in-step/invite-rate-limited', p['sign-up-rate-limited'], p.group, () => signUp(signInInviteStep, signInResults.inviteRateLimited)),
  entry('screen-helper-invite/default', p.helper, p.group, () => helper()),
  entry('screen-helper-invite/prefilled', p['helper-prefilled'], p.group, () => helper(helperInvitePrefilled)),
  entry('screen-helper-invite/incorrect', p['helper-incorrect'], p.group, () => helper(helperInvite, helperInviteResults.incorrect)),
  entry('screen-helper-invite/expired', p['helper-expired'], p.group, () => helper(helperInvitePrefilled, helperInviteResults.expired)),
  entry('screen-helper-invite/client-code', p['helper-client-code'], p.group, () => helper(helperInvite, helperInviteResults.forClients)),
  entry('screen-admin-beta/lead', a.lead, a.group, () => admin()),
  entry('screen-admin-beta/read-only', a.agent, a.group, () => admin(adminBetaReadOnly, false)),
  entry('screen-admin-beta/invite-only', a['invite-only'], a.group, () => admin(adminBetaInviteOnly)),
  entry('screen-admin-beta/empty', a.empty, a.group, () => admin(adminBetaEmpty)),
];
