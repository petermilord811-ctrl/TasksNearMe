import type { ShellViewer, SignedInViewer, StaffViewer } from '@/contracts';
import { jordanSparks, mayaSparks } from './sparks';

export const publicViewer: ShellViewer = { kind: 'public' };

export const mayaShell: SignedInViewer = {
  kind: 'user',
  id: 'usr_maya',
  displayName: 'Maya R.',
  initials: 'MR',
  mode: 'poster',
  helperReady: false,
  unreadMessages: 2,
  unreadNotifications: 3,
  username: 'maya',
  sparks: mayaSparks,
};

export const jordanShell: SignedInViewer = {
  kind: 'user',
  id: 'usr_jordan',
  displayName: 'Jordan T.',
  initials: 'JT',
  mode: 'helper',
  helperReady: true,
  unreadMessages: 1,
  unreadNotifications: 5,
  username: 'jordan',
  sparks: jordanSparks,
};

/** Helper mode chosen but onboarding unfinished. */
export const priyaShell: SignedInViewer = {
  kind: 'user',
  id: 'usr_priya',
  displayName: 'Priya S.',
  initials: 'PS',
  mode: 'helper',
  helperReady: false,
  unreadMessages: 0,
  unreadNotifications: 0,
  // Her profile is saved and her ID photos are with our team; the home address (which opens helping) is next.
  helperSetup: {
    canHelp: false,
    checks: [
      { step: 'address', state: 'todo' },
      { step: 'phone', state: 'done' },
      { step: 'identity', state: 'in_review' },
      { step: 'payout', state: 'todo' },
      { step: 'background', state: 'todo' },
    ],
    done: 1,
    total: 5,
    next: 'address',
  },
};

export const alexStaff: StaffViewer = {
  kind: 'staff',
  id: 'stf_alex',
  displayName: 'Alex P.',
  initials: 'AP',
  roles: ['support_agent'],
  twoStepVerified: true,
};

export const morganStaff: StaffViewer = {
  kind: 'staff',
  id: 'stf_morgan',
  displayName: 'Morgan L.',
  initials: 'ML',
  roles: ['support_lead'],
  twoStepVerified: true,
};

export const rileyStaff: StaffViewer = {
  kind: 'staff',
  id: 'stf_riley',
  displayName: 'Riley N.',
  initials: 'RN',
  roles: ['admin'],
  twoStepVerified: true,
};
