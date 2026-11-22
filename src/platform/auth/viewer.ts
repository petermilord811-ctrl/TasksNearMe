import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { STAFF_ROLES, type Mode, type Photo, type ShellViewer, type SignedInViewer, type StaffRole, type StaffViewer, type TimeZone } from '@/contracts';
import { usernames, staffRoles, staffSessionChecks, users } from '@/modules/accounts/schema';
import { profileComplete } from '@/modules/accounts/sign-in/steps';
import { avatarPhoto } from '@/modules/files/photos';
import { userTimeZone } from '@/modules/markets/time-zone';
import { helperProfiles } from '@/modules/profiles/schema';
import { db } from '@/platform/db/client';
import { setDefaultRequestTimeZone } from '@/shared/format/request-zone';
import { auth } from './auth';
import { authRequestHeaders } from './request-headers';
import { staffCheckCurrent } from './staff-check';

export interface ViewerUser {
  id: string;
  sessionId: string;
  email: string;
  firstName: string;
  displayName: string;
  initials: string;
  /** The profile photo, when they added one. */
  photo?: Photo;
  mode: Mode;
  status: string;
  staffRoles: StaffRole[];
  staffTwoStepVerified: boolean;
  helperStatus: 'none' | 'draft' | 'active' | 'paused' | 'suspended';
  /** Their home market's zone: their pages' dates are on its clock (completion plan 8.1). */
  timeZone: TimeZone;
  /** Their @username (2026-11-22); the signed-in shell gives them one when they have none yet. */
  username?: string;
}

export type Viewer = { kind: 'public' } | { kind: 'user'; user: ViewerUser };

function initialsOf(firstName: string, lastName: string, fallback: string): string {
  const letters = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim();
  return (letters || fallback.slice(0, 2)).toUpperCase();
}

/** Account statuses that never act as signed in (src/modules/accounts/account-moderation.ts sets them). */
const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'deleted']);

/** The signed-in person for this request (deduplicated per request). */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await auth.api.getSession({ headers: await authRequestHeaders() });
  if (!session) return { kind: 'public' };

  const u = session.user as typeof session.user & {
    firstName?: string;
    lastName?: string;
    mode?: string;
    status?: string;
    avatarFileId?: string | null;
  };
  // A suspended, banned or deleted account is signed out everywhere, even with a session that outlived the block
  // (one created while staff were blocking it, say): every page and action sees the public viewer (5.18).
  if (u.status && BLOCKED_STATUSES.has(u.status)) return { kind: 'public' };

  const [roleRows, profileRows, checkRows, timeZone, accountRows] = await Promise.all([
    db.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, u.id)),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, u.id)),
    db.select({ verifiedAt: staffSessionChecks.verifiedAt }).from(staffSessionChecks).where(eq(staffSessionChecks.sessionId, session.session.id)),
    userTimeZone(db, u.id),
    // From the row, not the session: a session's cached names could lag the profile step just saved.
    db
      .select({ firstName: users.firstName, lastName: users.lastName, adultAttestedAt: users.adultAttestedAt, termsAcceptedAt: users.termsAcceptedAt, phoneVerifiedAt: users.phoneVerifiedAt, username: usernames.username })
      .from(users)
      .leftJoin(usernames, eq(usernames.userId, users.id))
      .where(eq(users.id, u.id)),
  ]);
  // Sign-up unfinished (no name, 18+ or terms yet; a private beta's invite comes before them): signed out to every page
  // and action, which send it to /sign-in to finish (security review SEC18). Only sign-in's own steps and the privacy
  // requests read the session another way (tests/unit/unfinished-sign-up-actions.test.ts).
  const account = accountRows[0];
  if (!account || !profileComplete(account)) return { kind: 'public' };
  // The request's dates default to the person's own market clock (a page about another market names its own).
  setDefaultRequestTimeZone(timeZone);

  const firstName = u.firstName ?? '';
  const lastName = u.lastName ?? '';
  const roles = roleRows.map((r) => r.role).filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r));

  return {
    kind: 'user',
    user: {
      id: u.id,
      sessionId: session.session.id,
      email: u.email,
      firstName,
      displayName: u.name || [firstName, lastName ? `${lastName.charAt(0)}.` : ''].filter(Boolean).join(' ') || u.email,
      initials: initialsOf(firstName, lastName, u.email),
      ...(u.avatarFileId ? { photo: avatarPhoto(u.avatarFileId, u.name) } : {}),
      mode: u.mode === 'helper' ? 'helper' : 'poster',
      status: u.status ?? 'active',
      staffRoles: roles,
      // A check lasts a working day, not the session's 30 days (staff-check.ts).
      staffTwoStepVerified: staffCheckCurrent(checkRows),
      helperStatus: (profileRows[0]?.status as ViewerUser['helperStatus'] | undefined) ?? 'none',
      timeZone,
      ...(account.username ? { username: account.username } : {}),
    },
  };
});

/**
 * The session's own account, finished signing up or not (never a suspended, banned or deleted one): only for what an
 * unfinished sign-up may still do besides sign-in's steps, its privacy requests (src/modules/privacy/actions.ts).
 * Everything else uses getViewer.
 */
export const getSessionAccountId = cache(async (): Promise<string | null> => {
  const session = await auth.api.getSession({ headers: await authRequestHeaders() });
  if (!session) return null;
  const status = (session.user as typeof session.user & { status?: string }).status;
  return status && BLOCKED_STATUSES.has(status) ? null : session.user.id;
});

export function toSignedInViewer(user: ViewerUser): SignedInViewer {
  return {
    kind: 'user',
    id: user.id,
    displayName: user.displayName,
    initials: user.initials,
    ...(user.photo ? { photo: user.photo } : {}),
    mode: user.mode,
    // Paused helpers still use helper mode; they're just hidden from search.
    helperReady: user.helperStatus === 'active' || user.helperStatus === 'paused',
    // The signed-in app shell fills in the real counts (src/app/(app)/app/signed-in-shell.tsx).
    unreadMessages: 0,
    unreadNotifications: 0,
    ...(user.username ? { username: user.username } : {}),
  };
}

export function toStaffViewer(user: ViewerUser): StaffViewer {
  return {
    kind: 'staff',
    id: user.id,
    displayName: user.displayName,
    initials: user.initials,
    ...(user.photo ? { photo: user.photo } : {}),
    roles: user.staffRoles,
    twoStepVerified: user.staffTwoStepVerified,
  };
}

/** What the public header should show: signed out, a signed-in member, or staff. */
export async function getPublicShellViewer(): Promise<ShellViewer> {
  const viewer = await getViewer();
  if (viewer.kind === 'public') return { kind: 'public' };
  return viewer.user.staffRoles.length > 0 ? toStaffViewer(viewer.user) : toSignedInViewer(viewer.user);
}
