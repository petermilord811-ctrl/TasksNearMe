import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import {
  clientAccountVerification,
  fakeAccountHandlers,
  fakeHandler,
  fakeOnboardingHandlers,
  fakeProfileEditorHandlers,
  foundingEarnedCard,
  foundingLastSpotCard,
  helperAccountVerification,
  jordanAccountData,
  jordanShell,
  lateHelperStanding,
  mayaAccountData,
  mayaShell,
  newHelperStanding,
  onboardingProfileStep,
  priyaShell,
  sam,
  samProfileEditorData,
  verifiedHelperStanding,
} from '@/fixtures';
import { AccountScreen } from '@/ui/screens/account/account-screen';
import { HelperOnboardingScreen } from '@/ui/screens/helper';
import { HelperProfileEditorScreen } from '@/ui/screens/helper/helper-profile-editor-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/helperStanding.json';

/** The profile's first page (completion plan 6.5): the founding gift card and the verification steps. */

const p = copy.previews;
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const samShell: SignedInViewer = { kind: 'user', id: sam.id, displayName: sam.displayName, initials: sam.initials, mode: 'helper', helperReady: true, unreadMessages: 0, unreadNotifications: 0 };

function Shell({ viewer, path, flow = false, children }: { viewer: SignedInViewer; path: string; flow?: boolean; children: ReactNode }) {
  return <AppShell viewer={viewer} handlers={shellHandlers} currentPath={path} {...(flow ? { layout: 'flow' as const } : {})}>{children}</AppShell>;
}

const onboarding = (id: string, title: string, standing = newHelperStanding): PreviewEntry => ({
  id: `screen-helper-onboarding/${id}`, title, group: p.group, layout: 'fullscreen',
  render: () => <Shell viewer={priyaShell} path={routes.app.helperOnboarding('profile')} flow><HelperOnboardingScreen data={onboardingProfileStep} handlers={fakeOnboardingHandlers} standing={standing} /></Shell>,
});

export const helperStandingPreviews: PreviewEntry[] = [
  onboarding('profile-founding-open', p.onboardingOpen),
  onboarding('profile-founding-last-spot', p.onboardingLastSpot, { ...newHelperStanding, founding: foundingLastSpotCard }),
  onboarding('profile-no-founding', p.onboardingNoFounding, lateHelperStanding),
  {
    id: 'screen-helper-profile-editor/founding-yours', title: p.editorYours, group: p.group, layout: 'fullscreen',
    render: () => <Shell viewer={samShell} path={routes.app.helperProfile()}><HelperProfileEditorScreen data={samProfileEditorData} handlers={fakeProfileEditorHandlers} standing={verifiedHelperStanding} /></Shell>,
  },
  {
    id: 'screen-helper-profile-editor/founding-earned', title: p.editorEarned, group: p.group, layout: 'fullscreen',
    render: () => <Shell viewer={samShell} path={routes.app.helperProfile()}><HelperProfileEditorScreen data={samProfileEditorData} handlers={fakeProfileEditorHandlers} standing={{ ...verifiedHelperStanding, founding: foundingEarnedCard }} /></Shell>,
  },
  {
    id: 'screen-account/helper-verification', title: p.accountHelper, group: p.group, layout: 'fullscreen',
    render: () => <Shell viewer={jordanShell} path={routes.app.account()}><AccountScreen data={{ ...jordanAccountData, verification: helperAccountVerification }} handlers={fakeAccountHandlers} /></Shell>,
  },
  {
    id: 'screen-account/client-verification', title: p.accountClient, group: p.group, layout: 'fullscreen',
    render: () => <Shell viewer={mayaShell} path={routes.app.account()}><AccountScreen data={{ ...mayaAccountData, verification: clientAccountVerification }} handlers={fakeAccountHandlers} /></Shell>,
  },
];
