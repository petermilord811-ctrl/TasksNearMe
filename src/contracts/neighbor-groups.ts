import { z } from 'zod';
import type { ActionErrorCode, ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { ISODateTime, Photo } from './common';
import type { MessageSegment } from './messaging';

/**
 * Building and street groups on Neighbors (2026-11-24, from the owner's chat ideas: "opt-in small group chats, with the
 * same masking and reporting as other chats"). A group is a small private circle for one building or one street in one
 * neighborhood: never listed or searchable, never on a public page. People join only by an invitation they accept
 * (a link or code that lasts 7 days), and only from the group's own neighborhood. Messages are masked like a chat
 * before a booking, always (no booking unlocks a group); blocked people never see each other's messages; anyone can
 * report a message, its author can delete it, and our team can remove it from the report.
 */

export const NEIGHBOR_GROUP_KINDS = ['building', 'street'] as const;
export type NeighborGroupKind = (typeof NEIGHBOR_GROUP_KINDS)[number];
export type NeighborGroupRole = 'admin' | 'member';

/** The rules the server keeps (and the UI shows): groups a person may create, members a group may have, and so on. */
export const NEIGHBOR_GROUP_LIMITS = {
  /** Groups one person may create, ever (closed ones count). */
  createdPerPerson: 3,
  /** People in one group, its admin included. */
  members: 50,
  /** How long an invite link or code works. */
  inviteDays: 7,
  /** Messages one person may send to one group in a minute. */
  messagesPerMinute: 30,
  /** The newest messages a group view shows. */
  pageSize: 60,
} as const;

export const NEIGHBOR_GROUP_NAME_MIN = 3;
export const NEIGHBOR_GROUP_NAME_MAX = 60;
export const NEIGHBOR_GROUP_MESSAGE_MAX = 1000;
/** Invite codes: 8 letters and digits without look-alikes, shown in two groups of four ("K7QM-3XPD"). */
export const NEIGHBOR_GROUP_CODE_LENGTH = 8;

/** A group in the viewer's list (only their own groups: nobody sees a list of others). */
export interface NeighborGroupSummary {
  id: string;
  name: string;
  kind: NeighborGroupKind;
  /** The group's neighborhood. */
  areaName: string;
  memberCount: number;
  role: NeighborGroupRole;
  /** Messages since the viewer last opened it (never their own, never a blocked person's). */
  unreadCount: number;
  /** Muted: no notifications for it (the unread count still shows here). */
  muted: boolean;
  lastMessageAt?: ISODateTime;
}

/** Why someone can't create a group: no neighborhood chosen yet, or they created their 3. */
export type NeighborGroupCreateBlock = 'no_area' | 'limit_reached' | 'not_allowed';

/**
 * What an invite link or code leads to, for the person opening it.
 * - `valid`: they can join. `member`: they're in already (`group.id` opens it).
 * - `expired`, `revoked`, `not_found`: it no longer works (or never did).
 * - `wrong_area`: the group is for another neighborhood than theirs. `no_area`: they haven't chosen one.
 * - `full`: the group has its 50 members.
 */
export const NEIGHBOR_GROUP_INVITE_STATES = ['valid', 'member', 'expired', 'revoked', 'not_found', 'wrong_area', 'no_area', 'full'] as const;
export type NeighborGroupInviteState = (typeof NEIGHBOR_GROUP_INVITE_STATES)[number];

export interface NeighborGroupInvitePreview {
  code: string;
  state: NeighborGroupInviteState;
  /** The group, when the code exists and the state allows naming it (never for `not_found`, `revoked` or `expired`). */
  group?: { id: string; name: string; kind: NeighborGroupKind; areaName: string; memberCount: number };
  /** For `wrong_area`: the viewer's own neighborhood. */
  yourAreaName?: string;
  expiresAt?: ISODateTime;
}

/** Groups on the Neighbors page (`PortalPageData.groups`), for a signed-in member of the market. */
export interface NeighborGroupsData {
  /** The viewer's groups, the most recently active first. */
  groups: NeighborGroupSummary[];
  /** The viewer's neighborhood, which a new group belongs to. */
  areaName?: string;
  /** Creating one: allowed, or why not. */
  create: { allowed: true } | { allowed: false; reason: NeighborGroupCreateBlock };
  /** How many groups they may still create. */
  createsLeft: number;
  /** A group to open as the page loads (`?group=`, from a notification or the report's "Go back"): one of theirs. */
  openGroupId?: string;
  /** An invite opened from its link (`?join=`): the join dialog opens with it. */
  invite?: NeighborGroupInvitePreview;
}

/** A member as other members see them: first name and last initial, and their neighborhood. Never contact details. */
export interface NeighborGroupMemberView {
  userId: string;
  displayName: string;
  initials: string;
  areaName?: string;
  photo?: Photo;
  role: NeighborGroupRole;
  isYou: boolean;
  joinedAt: ISODateTime;
  /** The admin can remove this member (never themselves). */
  canRemove: boolean;
}

/** A message as written (masked), deleted by its author, or removed by our team. */
export type NeighborGroupMessageStatus = 'visible' | 'deleted' | 'removed';

export interface NeighborGroupMessageView {
  id: string;
  author: { userId: string; displayName: string; initials: string; areaName?: string; photo?: Photo; isYou: boolean };
  /** The text, contact details masked; empty once deleted or removed. */
  segments: MessageSegment[];
  status: NeighborGroupMessageStatus;
  createdAt: ISODateTime;
  /** The viewer reported it (it stays, marked, until our team looks). */
  reportedByYou: boolean;
  /** Its author can delete it. */
  canDelete: boolean;
  /** Anyone else can report it (`routes.app.report('group_message', id)`), once. */
  canReport: boolean;
}

/** An invite a member made: its link and code until it expires or the admin revokes it. */
export interface NeighborGroupInviteView {
  id: string;
  code: string;
  /** `routes.app.joinNeighborGroup(code)`: the page opens the join dialog over Neighbors. */
  href: string;
  expiresAt: ISODateTime;
  createdBy: string;
  /** The admin can revoke it. */
  canRevoke: boolean;
}

/** One group, open over the Neighbors page (`NeighborGroupHandlers.onOpen`). Members only. */
export interface NeighborGroupView {
  group: { id: string; name: string; kind: NeighborGroupKind; areaName: string; memberCount: number; createdAt: ISODateTime };
  you: { role: NeighborGroupRole; muted: boolean; canSend: boolean };
  /** Oldest first: the newest `NEIGHBOR_GROUP_LIMITS.pageSize`. */
  messages: NeighborGroupMessageView[];
  /** There are older messages than these. */
  hasEarlier: boolean;
  /** Messages left out because the viewer and their author blocked one another (either way). */
  blockedHidden: number;
  members: NeighborGroupMemberView[];
  /** Invites still working: all of them for the admin, a member's own for a member. */
  invites: NeighborGroupInviteView[];
  /** A member can make an invite (not when the group is full). */
  canInvite: boolean;
  memberLimit: number;
}

export const neighborGroupCreateInputSchema = z.object({
  name: z.string().trim().min(NEIGHBOR_GROUP_NAME_MIN, 'too_short').max(NEIGHBOR_GROUP_NAME_MAX, 'too_long'),
  kind: z.enum(NEIGHBOR_GROUP_KINDS, 'required'),
});
export type NeighborGroupCreateInput = z.input<typeof neighborGroupCreateInputSchema>;

export const neighborGroupMessageInputSchema = z.object({
  groupId: z.string().min(1),
  body: z.string().trim().min(1, 'required').max(NEIGHBOR_GROUP_MESSAGE_MAX, 'too_long'),
});
export type NeighborGroupMessageInput = z.input<typeof neighborGroupMessageInputSchema>;

export const neighborGroupCodeInputSchema = z.object({ code: z.string().trim().min(1, 'required').max(40, 'invalid') });
export type NeighborGroupCodeInput = z.input<typeof neighborGroupCodeInputSchema>;

/** A result that names a group (created or joined), so the screen opens it. */
export type NeighborGroupResult = ActionResult & { groupId?: string };
/** An invite made: its link and code. */
export type NeighborGroupInviteResult = { ok: true; invite: NeighborGroupInviteView } | { ok: false; code: ActionErrorCode; fieldErrors?: Partial<Record<string, FieldErrorCode[]>> };

/**
 * - `onOpen`: the group (and it's read now); `null` for anyone not in it.
 * - `onCreate`: ok `saved` with `groupId`. Errors: `validation_failed` (`name`, `kind`), `limit_reached` (3 created),
 *   `not_allowed` (no neighborhood, or an account that can't post).
 * - `onPreviewInvite`: what a code leads to.
 * - `onJoin`: ok `updated` with `groupId`. Errors: `not_found`, `expired`, `not_allowed` (another neighborhood, revoked),
 *   `limit_reached` (full).
 * - `onSend`: ok `sent`. Errors: `validation_failed` (`body`), `rate_limited` (30 a minute), `not_found` (not a member).
 * - `onDeleteMessage`: the author's own. ok `updated`.
 * - `onInvite`: a new invite for the group (any member). Errors: `limit_reached` (full), `rate_limited`, `not_found`.
 * - `onRevokeInvite`: the admin. ok `updated`.
 * - `onRemoveMember`: the admin removes someone. ok `updated`.
 * - `onLeave`: anyone leaves (an admin's role passes to the longest-standing member; the last one out closes it). ok `updated`.
 * - `onMute`: no notifications for the group, or again. ok `updated`.
 */
export interface NeighborGroupHandlers {
  onOpen: QueryHandler<{ groupId: string }, NeighborGroupView | null>;
  onCreate: QueryHandler<NeighborGroupCreateInput, NeighborGroupResult>;
  onPreviewInvite: QueryHandler<NeighborGroupCodeInput, NeighborGroupInvitePreview>;
  onJoin: QueryHandler<NeighborGroupCodeInput, NeighborGroupResult>;
  onSend: ActionHandler<NeighborGroupMessageInput>;
  onDeleteMessage: ActionHandler<{ messageId: string }>;
  onInvite: QueryHandler<{ groupId: string }, NeighborGroupInviteResult>;
  onRevokeInvite: ActionHandler<{ inviteId: string }>;
  onRemoveMember: ActionHandler<{ groupId: string; userId: string }>;
  onLeave: ActionHandler<{ groupId: string }>;
  onMute: ActionHandler<{ groupId: string; muted: boolean }>;
}

/** A reported group message on its case (staff tools): as written, with its group, and removing or restoring it. */
export interface AdminCaseGroupMessage {
  message: { id: string; body: string; author: { displayName: string }; createdAt: ISODateTime };
  group: { name: string; kind: NeighborGroupKind; areaName: string; memberCount: number };
  status: NeighborGroupMessageStatus;
  /** Why staff removed it (staff only). */
  removedReason?: string;
  /** Trust and safety, support leads and admins (audited, and noted on the case). */
  canModerate: boolean;
}
