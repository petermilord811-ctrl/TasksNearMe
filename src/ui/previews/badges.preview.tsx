import { routes, type AppShellHandlers, type PreviewEntry } from '@/contracts';
import { adminBadgeRows, ADMIN_NOW, adminUserJordanData, fakeAccountHandlers, fakeAdminUserHandlers, fakeHandler, jordanWithBadges, morganStaff, mayaAccountData, mayaShell, noOwnBadges, publicViewer, samOwnBadges, samProfileWithBadges, samWithBadges } from '@/fixtures';
import { HelperCard } from '@/ui/components/people/helper-card';
import { AccountScreen } from '@/ui/screens/account/account-screen';
import { AdminUserScreen } from '@/ui/screens/admin';
import { AdminShell } from '@/ui/shells/admin-shell';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/badges.json';

/** Achievement badges (completion plan 6.4): the public profile, helper cards (top 3) and the account page. */

const p = copy.previews;
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

export const badgesPreviews: PreviewEntry[] = [
  {
    id: 'screen-helper-profile/badges', title: p.profile, group: p.group, layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.helperProfile(samProfileWithBadges.helper.handle)}><HelperProfileScreen data={samProfileWithBadges} /></PublicShell>,
  },
  {
    id: 'helper-card/badges', title: p.cards, group: p.group,
    render: () => <ul className="grid gap-4 p-4 sm:grid-cols-2">{[samWithBadges, jordanWithBadges].map((helper) => <li key={helper.id}><HelperCard helper={helper} /></li>)}</ul>,
  },
  {
    id: 'screen-account/badges', title: p.account, group: p.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.account()}><AccountScreen data={{ ...mayaAccountData, badges: samOwnBadges }} handlers={fakeAccountHandlers} /></AppShell>,
  },
  {
    id: 'screen-account/badges-none', title: p.accountNone, group: p.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.account()}><AccountScreen data={{ ...mayaAccountData, badges: noOwnBadges }} handlers={fakeAccountHandlers} /></AppShell>,
  },
  {
    id: 'screen-admin-user/badges', title: p.admin, group: p.group, layout: 'fullscreen',
    render: () => <AdminShell viewer={morganStaff} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={routes.admin.user(adminUserJordanData.user.id)}>
      <AdminUserScreen data={{ ...adminUserJordanData, badges: adminBadgeRows, canModerateBadges: true }} handlers={{ ...fakeAdminUserHandlers, onModerateBadge: fakeHandler({ ok: true, code: 'updated' }) }} now={ADMIN_NOW} />
    </AdminShell>,
  },
];
