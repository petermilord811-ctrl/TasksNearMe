import { z } from 'zod';
import type { ActionErrorCode, ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { ISODateTime, Photo } from './common';
import { requestKeyField } from './forms';
import type { AttachGifInput, GifSearchInput, GifSearchResult } from './gifs';
import type { MessageReaction, MessageSegment } from './messaging';
import type { PhotoUploadResult } from './posting';

/**
 * Building and street groups on Neighbors (2026-11-24, from the owner's chat ideas: "opt-in small group chats, with the
 * same masking and reporting as other chats"). A group is a small private circle for one building or one street in one
 * neighborhood: never listed or searchable, never on a public page. People join only by an invitation they accept
 * (a link or code that lasts 7 days), and only from the group's own neighborhood. Messages are masked like a chat
 * before a booking, always (no booking unlocks a group); blocked people never see each other's messages; anyone can
 * report a message, its author can delete it, and our team can remove it from the report.
 *
 * Chat as in a conversation (2026-11-24, owner: "Group chat feature is not fully implemented yet"): photos (only the
 * group's current members open them), GIFs, emoji reactions, replies that quote a message, the "New messages" line and
 * "typing…". Live notices carry ids only: `update` with `event: 'group.message'` and `group`, and `typing` with `group`
 * and `user` (the member typing), on each member's own channel.
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
  /** Photos (or one GIF) a message carries. */
  photosPerMessage: 4,
  /** Reactions one person may add or take back a minute. */
  reactionsPerMinute: 60,
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

/**
 * The message a reply quotes, as the viewer may see it now: its first words (masked) and who wrote it; or only why it
 * can't show (`deleted`, `removed`, or `hidden`: its author and the viewer blocked one another, so neither the words nor
 * the name show).
 */
export interface NeighborGroupQuote {
  id: string;
  status: NeighborGroupMessageStatus | 'hidden';
  /** Absent when `hidden`. */
  author?: { displayName: string; isYou: boolean };
  /** Its words, masked; empty unless `visible`. */
  segments: MessageSegment[];
  /** It carried photos or a GIF (shown as "Photo" or "GIF", beside any words). Only when `visible`. */
  media?: 'photo' | 'gif';
}

/** A reaction on a group message: the emoji, how many gave it (never counting someone blocked either way), and whether the viewer did. */
export interface NeighborGroupReaction {
  emoji: MessageReaction;
  count: number;
  mine: boolean;
}

export interface NeighborGroupMessageView {
  id: string;
  author: { userId: string; displayName: string; initials: string; areaName?: string; photo?: Photo; isYou: boolean };
  /** The text, contact details masked; empty once deleted or removed (a message can be photos or a GIF alone). */
  segments: MessageSegment[];
  /** Its photos, or its GIF (`animated`), in order; empty once deleted or removed. Opened only by current members. */
  attachments: Photo[];
  /** A reply: the message it quotes. */
  replyTo?: NeighborGroupQuote;
  /** In `MESSAGE_REACTIONS` order; only on a message that shows. */
  reactions: NeighborGroupReaction[];
  status: NeighborGroupMessageStatus;
  createdAt: ISODateTime;
  /** The viewer reported it (it stays, marked, until our team looks). */
  reportedByYou: boolean;
  /** Its author can delete it. */
  canDelete: boolean;
  /** Anyone else can report it (`routes.app.report('group_message', id)`), once. */
  canReport: boolean;
  /** The viewer may react to it (it shows, and their account may write). */
  canReact: boolean;
  /** The viewer may reply to it, quoting it (it shows, and their account may write). */
  canReply: boolean;
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
  /**
   * The first message that was new to the viewer when this view was read (someone else's, written after they last read
   * the group): the "New messages" line goes above it. Reading the view reads the group, so a later read moves it on;
   * the sheet keeps the one it opened with.
   */
  firstUnreadId?: string;
  /** What the composer takes: characters, photos a message, and each photo's size. */
  composer: { maxLength: number; maxAttachments: number; maxPhotoMegabytes: number };
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

/**
 * A message to a group: words, photos (uploaded first with `onUploadPhoto`, or a picked GIF with `onAttachGif`), or both;
 * optionally a reply to one of the group's messages; and the composer's key, so a retry after an answer that never
 * arrived sends it once.
 */
export const neighborGroupMessageInputSchema = z
  .object({
    groupId: z.string().min(1),
    body: z.string('required').trim().max(NEIGHBOR_GROUP_MESSAGE_MAX, 'too_long').default(''),
    attachmentIds: z.array(z.string().min(1).max(80)).max(NEIGHBOR_GROUP_LIMITS.photosPerMessage, 'too_long').default([]),
    replyToId: z.string().min(1).max(80).optional(),
    requestKey: requestKeyField.optional(),
  })
  .refine((input) => input.body.length > 0 || input.attachmentIds.length > 0, { path: ['body'], message: 'required' });
export type NeighborGroupMessageInput = z.input<typeof neighborGroupMessageInputSchema>;

/** A reaction added (`on`) or taken back. */
export interface NeighborGroupReactionInput {
  messageId: string;
  emoji: MessageReaction;
  on: boolean;
}

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
 * - `onSend`: ok `sent`. Errors: `validation_failed` (`body`; `attachmentIds`: not the viewer's own new group photos;
 *   `replyToId`: not a message of the group they can see), `rate_limited` (30 a minute, with `retryAt`), `not_found` (not
 *   a member), `not_allowed` (an account that can't write).
 * - `onUploadPhoto`: a photo for a group message (re-encoded; location data removed). Errors as for any photo.
 * - `onSearchGifs`, `onAttachGif`: as in a conversation (`ThreadHandlers`); absent where GIFs are off. A picked GIF goes at
 *   once as its own message with `onSend`.
 * - `onReact`: a reaction on a message that shows. ok `updated`. Errors: `validation_failed` (an emoji not offered),
 *   `not_found` (not a member, or a message they can't see), `not_allowed` (an account that can't write), `rate_limited`.
 * - `onTyping`: "typing…" for the other members (fire and forget; at most one notice every 2.5 s).
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
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  onSearchGifs?: QueryHandler<GifSearchInput, GifSearchResult>;
  onAttachGif?: QueryHandler<AttachGifInput, PhotoUploadResult>;
  onReact: ActionHandler<NeighborGroupReactionInput>;
  onTyping?: (input: { groupId: string }) => Promise<void>;
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
  /** Its photos or GIF, through the staff link (each opening is audited); absent when it has none. */
  photos?: Photo[];
  group: { name: string; kind: NeighborGroupKind; areaName: string; memberCount: number };
  status: NeighborGroupMessageStatus;
  /** Why staff removed it (staff only). */
  removedReason?: string;
  /** Trust and safety, support leads and admins (audited, and noted on the case). */
  canModerate: boolean;
}
