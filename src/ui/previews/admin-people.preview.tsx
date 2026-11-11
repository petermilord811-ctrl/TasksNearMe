import type { ComponentProps, ReactNode } from 'react';
import {
  routes,
  type ActionResult,
  type AdminRewardsHandlers,
  type AdminRewardsPageData,
  type AdminUserHandlers,
  type AdminUserPageData,
  type AdminUsersPageData,
  type PreviewEntry,
  type StaffViewer,
} from '@/contracts';
import {
  ADMIN_NOW,
  adminRewardsEmptyData,
  adminRewardsFailedData,
  adminRewardsReviewData,
  adminUserJordanData,
  adminUserReadOnlyData,
  adminUserSuspendedData,
  adminUsersData,
  adminUsersEmptyData,
  adminUsersSearchData,
  alexStaff,
  fakeAdminRewardsHandlers,
  fakeAdminUserHandlers,
  fakeHandler,
  morganStaff,
} from '@/fixtures';
import { AdminRewardsContent } from '@/ui/screens/admin/admin-rewards-screen';
import { AdminUserContent } from '@/ui/screens/admin/admin-user-screen';
import { AdminUsersScreen } from '@/ui/screens/admin/admin-users-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import rewardCopy from '../../../messages/en/ui/adminRewards.json';
import userCopy from '../../../messages/en/ui/adminUser.json';
import usersCopy from '../../../messages/en/ui/adminUsers.json';
import homeCopy from '../../../messages/en/ui/adminHome.json';

const r = rewardCopy.previews;
const u = userCopy.previews;
const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const rewardHandlers: AdminRewardsHandlers = {
  ...fakeAdminRewardsHandlers,
  onDecide: fakeHandler({ ok: true, code: 'updated' }),
};
const userHandlers: AdminUserHandlers = {
  ...fakeAdminUserHandlers,
  onSuspension: fakeHandler({ ok: true, code: 'updated' }),
};

function Shell({ path, viewer = morganStaff, personName, children }: {
  path: string;
  viewer?: StaffViewer;
  personName?: string;
  children: ReactNode;
}) {
  return <AdminShell viewer={viewer} handlers={shellHandlers} currentPath={path} breadcrumbs={personName ? [
    { label: homeCopy.title, href: routes.admin.home() },
    { label: usersCopy.title, href: routes.admin.users() },
    { label: personName },
  ] : undefined}>{children}</AdminShell>;
}

type RewardSeeds = Pick<ComponentProps<typeof AdminRewardsContent>, 'initialDialog' | 'decisionState'>;
function rewardPreview(id: string, title: string, data: AdminRewardsPageData = adminRewardsReviewData, seeds: RewardSeeds = {}): PreviewEntry {
  const result = seeds.decisionState?.initialResult;
  return {
    id: `screen-admin-rewards/${id}`, group: r.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.rewards(data.filter)} viewer={data.filter === 'failed' ? alexStaff : morganStaff}>
      <AdminRewardsContent data={data} handlers={{ ...rewardHandlers, onDecide: fakeHandler(result ?? { ok: true, code: 'updated' }) }} now={ADMIN_NOW} {...seeds} />
    </Shell>,
  };
}

function usersPreview(id: string, title: string, data: AdminUsersPageData): PreviewEntry {
  return {
    id: `screen-admin-users/${id}`, group: usersCopy.previews.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.users(data.query)}><AdminUsersScreen data={data} now={ADMIN_NOW} /></Shell>,
  };
}

type UserSeeds = Pick<ComponentProps<typeof AdminUserContent>, 'initialDialog' | 'suspensionState'>;
function userPreview(id: string, title: string, data: AdminUserPageData = adminUserJordanData, seeds: UserSeeds = {}, viewer: StaffViewer = morganStaff): PreviewEntry {
  const result = seeds.suspensionState?.initialResult;
  return {
    id: `screen-admin-user/${id}`, group: u.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.user(data.user.id)} personName={data.user.person.displayName} viewer={viewer}>
      <AdminUserContent data={data} handlers={{ ...userHandlers, onSuspension: fakeHandler(result ?? { ok: true, code: 'updated' }) }} now={ADMIN_NOW} {...seeds} />
    </Shell>,
  };
}

const reviewGrantId = adminRewardsReviewData.rows[0].id;
const failedGrantId = adminRewardsFailedData.rows[0].id;
const rewardValidation: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { note: ['too_short'] } };
const suspensionValidation: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } };

export const adminPeoplePreviews: PreviewEntry[] = [
  rewardPreview('review', r.review),
  rewardPreview('failed', r.failed, adminRewardsFailedData),
  rewardPreview('empty', r.empty, adminRewardsEmptyData),
  rewardPreview('decision-dialog', r.decisionDialog, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'approve_review' },
  }),
  rewardPreview('reject-dialog', r.rejectDialog, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'reject_review' },
  }),
  rewardPreview('void-dialog', r.voidDialog, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'void' },
  }),
  rewardPreview('reissue-dialog', r.reissueDialog, adminRewardsFailedData, {
    initialDialog: { grantId: failedGrantId, action: 'reissue' },
  }),
  rewardPreview('decision-pending', r.pending, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'approve_review' },
    decisionState: { initialNote: r.previewNote, initialPending: true },
  }),
  rewardPreview('decision-updated', r.updated, adminRewardsReviewData, {
    decisionState: { initialResult: { ok: true, code: 'updated' } },
  }),
  rewardPreview('decision-validation-failed', r.validationFailed, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'approve_review' },
    decisionState: { initialResult: rewardValidation },
  }),
  ...(['not_allowed', 'unknown'] as const).map((code) => rewardPreview(`decision-${code.replaceAll('_', '-')}`, code === 'not_allowed' ? r.notAllowed : r.unknown, adminRewardsReviewData, {
    initialDialog: { grantId: reviewGrantId, action: 'approve_review' },
    decisionState: { initialNote: r.previewNote, initialResult: { ok: false, code } },
  })),
  usersPreview('default', usersCopy.previews.default, adminUsersData),
  usersPreview('search', usersCopy.previews.search, adminUsersSearchData),
  usersPreview('empty', usersCopy.previews.empty, adminUsersEmptyData),
  userPreview('helper', u.helper),
  userPreview('suspended', u.suspended, adminUserSuspendedData),
  userPreview('read-only', u.readOnly, adminUserReadOnlyData, {}, alexStaff),
  userPreview('suspend-dialog', u.suspendDialog, adminUserJordanData, { initialDialog: 'suspend_helper' }),
  userPreview('reinstate-dialog', u.reinstateDialog, adminUserSuspendedData, { initialDialog: 'reinstate_helper' }),
  userPreview('suspension-pending', u.pending, adminUserJordanData, {
    initialDialog: 'suspend_helper', suspensionState: { initialReason: u.previewReason, initialPending: true },
  }),
  userPreview('suspension-updated', u.updated, adminUserJordanData, {
    suspensionState: { initialResult: { ok: true, code: 'updated' } },
  }),
  userPreview('suspension-validation-failed', u.validationFailed, adminUserJordanData, {
    initialDialog: 'suspend_helper', suspensionState: { initialResult: suspensionValidation },
  }),
  ...(['not_allowed', 'unknown'] as const).map((code) => userPreview(`suspension-${code.replaceAll('_', '-')}`, code === 'not_allowed' ? u.notAllowed : u.unknown, adminUserJordanData, {
    initialDialog: 'suspend_helper', suspensionState: { initialReason: u.previewReason, initialResult: { ok: false, code } },
  })),
];
