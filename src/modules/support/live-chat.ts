import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, notInArray } from 'drizzle-orm';
import type { ActionResult, AdminLiveChatRow, AdminLiveChatView, AdminLivePageData, HelpLiveState, SupportTopic } from '@/contracts';
import { SUPPORT_TOPICS } from '@/contracts';
import { usernames, users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { STAFF_SUPPORT_CHANNEL, userChannel, type RealtimeEnvelope } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { supportCaseEvents, supportCases } from './schema';
import { audit, getAdminCase, loadCase, staffById, staffReply, type StaffActor } from './staff';
import { staffCaseActions } from './staff-domain';

/**
 * Live chat with support (2026-11-22, owner: "Talk to a person and connect to live agent should be implemented lively
 * as other platforms ... let users wait until support is attending to chatting, and I will support chatting (admins)").
 *
 * A member who asks TasksNearMe Help for a person gets a case at once (src/modules/support/service.ts,
 * `openCaseFromAssistant`) that waits in the live queue (`live_requested_at`). Anyone who works cases joins it from
 * `/admin/live` (`joinLiveChat`): the member sees "Alex joined the chat", and the two write to each other as it
 * happens, through the case's own conversation (staff's replies are `staffReply`'s; the member's are
 * `replyToSupportCase`'s). Staff end the chat (`endLiveChat`) and the case goes on in its queue like any other.
 *
 * Live notices carry ids only: the member hears about their case on their own channel, support staff on duty on the
 * staff channel (in the same stream as their own: src/app/api/realtime/route.ts). Pages read the rest themselves.
 */

type CaseRow = typeof supportCases.$inferSelect;

const FINISHED = ['resolved', 'closed'];
/** At most one "typing" notice per person and case this often. */
const TYPING_EVERY_MS = 2500;
const typingSentAt = new Map<string, number>();

const topicOf = (value: string | null): SupportTopic => ((SUPPORT_TOPICS as readonly string[]).includes(value ?? '') ? (value as SupportTopic) : 'other');

/** Live chats nobody from support has joined yet (not ended, case open), oldest first. */
async function waitingRows(db: Db): Promise<CaseRow[]> {
  return db
    .select()
    .from(supportCases)
    .where(and(isNotNull(supportCases.liveRequestedAt), isNull(supportCases.liveJoinedAt), isNull(supportCases.liveEndedAt), notInArray(supportCases.status, FINISHED)))
    .orderBy(asc(supportCases.liveRequestedAt), asc(supportCases.id));
}

/** How many live chats are waiting for someone: the staff menu's count. */
export async function liveWaitingCount(db: Db, _now: Date): Promise<number> {
  return (await waitingRows(db)).length;
}

/** A case's live chat as its member sees it: their place in line while waiting, who joined, or that it ended. */
export async function liveStateOf(db: Db, row: CaseRow, agentsOnline: number): Promise<HelpLiveState | undefined> {
  if (!row.liveRequestedAt) return undefined;
  const requestedAt = row.liveRequestedAt.toISOString();
  // A case resolved or closed while it was live ended the chat too.
  if (row.liveEndedAt || FINISHED.includes(row.status)) return { state: 'ended', agentsOnline: agentsOnline > 0, requestedAt };
  if (row.liveJoinedAt && row.liveAgentUserId) {
    const [agent] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, row.liveAgentUserId)).limit(1);
    return { state: 'joined', agentsOnline: true, ...(agent?.firstName ? { agentName: agent.firstName } : {}), requestedAt };
  }
  const ahead = await db
    .select({ id: supportCases.id })
    .from(supportCases)
    .where(and(isNotNull(supportCases.liveRequestedAt), isNull(supportCases.liveJoinedAt), isNull(supportCases.liveEndedAt), notInArray(supportCases.status, FINISHED), lte(supportCases.liveRequestedAt, row.liveRequestedAt)));
  return { state: 'waiting', position: Math.max(1, ahead.length), agentsOnline: agentsOnline > 0, requestedAt };
}

/** The member and support staff on duty hear that a live chat moved (ids only). */
async function tell(db: Db, row: Pick<CaseRow, 'id' | 'openedByUserId'>, event: string): Promise<void> {
  const envelopes: RealtimeEnvelope[] = [{ channel: STAFF_SUPPORT_CHANNEL, notice: { type: 'update', event, case: row.id } }];
  if (row.openedByUserId) envelopes.push({ channel: userChannel(row.openedByUserId), notice: { type: 'update', event, case: row.id } });
  await publishNotices(db, envelopes);
}

/** Support staff on duty hear that a live chat was asked for (by a hand-off, or on an open case). */
export async function announceLiveRequest(db: Db, caseId: string): Promise<void> {
  await publishNotices(db, [{ channel: STAFF_SUPPORT_CHANNEL, notice: { type: 'update', event: 'support.live_requested', case: caseId } }]);
}

/** A live chat on a case the member opened that has none yet (the Help conversation's "Chat live with support"). */
export async function requestLiveChat(db: Db, userId: string, caseId: string, now: Date): Promise<ActionResult> {
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row || row.openedByUserId !== userId || FINISHED.includes(row.status)) return { ok: false, code: 'not_allowed' };
  if (row.liveRequestedAt && !row.liveEndedAt) return { ok: true, code: 'updated' };
  await db.update(supportCases).set({ liveRequestedAt: now, liveJoinedAt: null, liveAgentUserId: null, liveEndedAt: null, updatedAt: now }).where(eq(supportCases.id, row.id));
  await announceLiveRequest(db, row.id);
  return { ok: true, code: 'updated' };
}

/** Someone from support takes a waiting live chat: they're on it, it's theirs, and the member sees them join. */
export async function joinLiveChat(db: Db, staff: StaffActor, caseId: string, now: Date): Promise<ActionResult> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !staffCaseActions(ctx.facts).includes('reply') || !ctx.row.liveRequestedAt) return { ok: false, code: 'not_allowed' };
  if (ctx.row.liveEndedAt) return { ok: false, code: 'expired' };
  if (ctx.row.liveAgentUserId === staff.id) return { ok: true, code: 'updated' };
  if (ctx.row.liveAgentUserId) return { ok: false, code: 'not_allowed' };
  const member = ctx.row.openedByUserId;
  const claimed = await db
    .update(supportCases)
    .set({ liveAgentUserId: staff.id, liveJoinedAt: now, ...(ctx.row.assigneeUserId ? {} : { assigneeUserId: staff.id }), updatedAt: now, version: ctx.row.version + 1 })
    .where(and(eq(supportCases.id, ctx.row.id), isNull(supportCases.liveAgentUserId), isNull(supportCases.liveEndedAt)))
    .returning({ id: supportCases.id });
  // Someone else joined a moment before.
  if (claimed.length === 0) return { ok: false, code: 'not_allowed' };
  await db.insert(supportCaseEvents).values({ id: newId('cev'), caseId: ctx.row.id, kind: 'live', authorUserId: staff.id, partyUserId: member, meta: { live: 'joined' }, createdAt: now });
  await audit(db, staff, 'case.live_join', ctx.row.id, now);
  await tell(db, ctx.row, 'support.live_joined');
  return { ok: true, code: 'updated' };
}

/** The live chat is over (the one on it, or a lead): the member sees it end, and can still write to the case. */
export async function endLiveChat(db: Db, staff: StaffActor, caseId: string, now: Date): Promise<ActionResult> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !ctx.row.liveRequestedAt || ctx.row.liveEndedAt) return { ok: false, code: 'not_allowed' };
  const lead = staff.roles.includes('support_lead') || staff.roles.includes('admin');
  if (ctx.row.liveAgentUserId !== staff.id && !lead && !(ctx.row.liveAgentUserId === null && staffCaseActions(ctx.facts).includes('reply'))) return { ok: false, code: 'not_allowed' };
  await db.update(supportCases).set({ liveEndedAt: now, updatedAt: now }).where(eq(supportCases.id, ctx.row.id));
  await db.insert(supportCaseEvents).values({ id: newId('cev'), caseId: ctx.row.id, kind: 'live', authorUserId: staff.id, partyUserId: ctx.row.openedByUserId, meta: { live: 'ended' }, createdAt: now });
  await audit(db, staff, 'case.live_end', ctx.row.id, now);
  await tell(db, ctx.row, 'support.live_ended');
  return { ok: true, code: 'updated' };
}

/** Staff write in the live chat: an ordinary reply to the member, heard at once. */
export async function liveReply(db: Db, staff: StaffActor, caseId: string, input: { body: string }, now: Date): Promise<ActionResult> {
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row?.openedByUserId) return { ok: false, code: 'not_allowed' };
  // Someone else's chat stays theirs (the case page is there for a lead who needs to step in).
  if (row.liveAgentUserId && row.liveAgentUserId !== staff.id && !row.liveEndedAt) return { ok: false, code: 'not_allowed' };
  const result = await staffReply(db, staff, row.id, { partyId: row.openedByUserId, body: String(input?.body ?? '') }, now);
  // The reply's own event tells the member's pages too; this is for the chat, without waiting on the dispatcher.
  if (result.ok) await tell(db, row, 'support.replied');
  return result;
}

/** The member wrote in a live chat (or a case waiting for one): support staff on duty hear it. */
export async function announceMemberReply(db: Db, caseId: string): Promise<void> {
  const [row] = await db.select({ live: supportCases.liveRequestedAt, ended: supportCases.liveEndedAt }).from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row?.live || row.ended) return;
  await publishNotices(db, [{ channel: STAFF_SUPPORT_CHANNEL, notice: { type: 'update', event: 'support.member_replied', case: String(caseId) } }]);
}

/**
 * "Typing…" in a live chat: from the member to support staff on duty, or from the one on it to the member. Spaced out
 * per person and case; nothing for a chat that isn't live.
 */
export async function typingInLiveChat(db: Db, actor: { userId: string; staff: boolean }, caseId: string, now: Date): Promise<void> {
  const key = `${actor.userId}:${caseId}`;
  if (now.getTime() - (typingSentAt.get(key) ?? 0) < TYPING_EVERY_MS) return;
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row?.liveRequestedAt || row.liveEndedAt) return;
  if (actor.staff ? row.liveAgentUserId !== actor.userId : row.openedByUserId !== actor.userId) return;
  typingSentAt.set(key, now.getTime());
  if (typingSentAt.size > 5_000) for (const [entry, at] of typingSentAt) if (now.getTime() - at > 60_000) typingSentAt.delete(entry);
  const channel = actor.staff ? userChannel(row.openedByUserId ?? '') : STAFF_SUPPORT_CHANNEL;
  if (actor.staff && !row.openedByUserId) return;
  await publishNotices(db, [{ channel, notice: { type: 'typing', case: row.id } }]);
}

// ---- The console ----------------------------------------------------------------------------------------------

/** The console's lists: waiting (oldest first), the viewer's, everyone else's (joined and not ended, newest first). */
async function consoleRows(db: Db, staff: StaffActor): Promise<{ waiting: AdminLiveChatRow[]; mine: AdminLiveChatRow[]; others: AdminLiveChatRow[] }> {
  const [waiting, joined] = await Promise.all([
    waitingRows(db),
    db
      .select()
      .from(supportCases)
      .where(and(isNotNull(supportCases.liveJoinedAt), isNull(supportCases.liveEndedAt), notInArray(supportCases.status, FINISHED)))
      .orderBy(desc(supportCases.liveJoinedAt))
      .limit(100),
  ]);
  const rows = [...waiting, ...joined];
  const ids = rows.map((row) => row.id);
  const memberIds = [...new Set(rows.flatMap((row) => (row.openedByUserId ? [row.openedByUserId] : [])))];
  const agentIds = [...new Set(rows.flatMap((row) => (row.liveAgentUserId ? [row.liveAgentUserId] : [])))];
  const [members, agents, lastEvents] = await Promise.all([
    memberIds.length ? db.select({ id: users.id, name: users.name, firstName: users.firstName, lastName: users.lastName, username: usernames.username, createdAt: users.createdAt, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).leftJoin(usernames, eq(usernames.userId, users.id)).where(inArray(users.id, memberIds)) : Promise.resolve([]),
    staffById(db, agentIds),
    ids.length
      ? db
          .select({ caseId: supportCaseEvents.caseId, authorUserId: supportCaseEvents.authorUserId, partyUserId: supportCaseEvents.partyUserId, body: supportCaseEvents.body, meta: supportCaseEvents.meta, createdAt: supportCaseEvents.createdAt })
          .from(supportCaseEvents)
          .where(and(inArray(supportCaseEvents.caseId, ids), eq(supportCaseEvents.kind, 'message')))
          .orderBy(desc(supportCaseEvents.createdAt))
      : Promise.resolve([]),
  ]);
  const memberOf = new Map(members.map((row) => [row.id, row]));
  const lastOf = new Map<string, (typeof lastEvents)[number]>();
  const lastStaffAt = new Map<string, Date>();
  for (const event of lastEvents) {
    if (!lastOf.has(event.caseId)) lastOf.set(event.caseId, event);
    const fromStaff = event.authorUserId !== null && event.authorUserId !== event.partyUserId;
    if (fromStaff && !lastStaffAt.has(event.caseId)) lastStaffAt.set(event.caseId, event.createdAt);
  }
  const toRow = (row: CaseRow): AdminLiveChatRow => {
    const member = row.openedByUserId ? memberOf.get(row.openedByUserId) : undefined;
    const name = member?.name || [member?.firstName, member?.lastName ? `${member.lastName.charAt(0)}.` : ''].filter(Boolean).join(' ') || '—';
    const newest = lastOf.get(row.id);
    // The request itself (on the case, not an event) is the last line until anyone writes after it, as on the Help row.
    const last = newest && newest.createdAt >= row.createdAt ? newest : { authorUserId: row.openedByUserId, partyUserId: row.openedByUserId, body: row.description, meta: null, createdAt: row.createdAt };
    const from = last.meta?.assistant ? 'assistant' : last.authorUserId && last.authorUserId === last.partyUserId ? 'member' : 'support';
    const lastMemberAt = lastEvents.find((event) => event.caseId === row.id && event.authorUserId !== null && event.authorUserId === event.partyUserId)?.createdAt ?? row.createdAt;
    const staffAt = lastStaffAt.get(row.id);
    const agent = row.liveAgentUserId ? agents.get(row.liveAgentUserId) : undefined;
    return {
      caseId: row.id,
      member: {
        id: row.openedByUserId ?? '',
        displayName: name,
        initials: name.split(/\s+/).map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase() || '?',
        memberSince: (member?.createdAt ?? row.createdAt).toISOString(),
        phoneVerified: Boolean(member?.phoneVerifiedAt),
        ...(member?.username ? { username: member.username } : {}),
      },
      topic: topicOf(row.topic),
      requestedAt: (row.liveRequestedAt ?? row.createdAt).toISOString(),
      ...(row.liveJoinedAt ? { joinedAt: row.liveJoinedAt.toISOString() } : {}),
      ...(agent ? { agent } : {}),
      ...(last.body ? { last: { from, body: last.body.slice(0, 160), at: last.createdAt.toISOString() } } : {}),
      waitingOnSupport: !staffAt || lastMemberAt > staffAt,
    };
  };
  return {
    waiting: waiting.map(toRow),
    mine: joined.filter((row) => row.liveAgentUserId === staff.id).map(toRow),
    others: joined.filter((row) => row.liveAgentUserId !== staff.id).map(toRow),
  };
}

/**
 * The conversation with the member's request in its place (it's on the case, not an event): after the chat with the
 * assistant, unless it only repeats their last question there (asking for a person in words sends that question).
 */
function withRequest(events: AdminLiveChatView['events'], row: CaseRow, member: AdminLiveChatView['member']): AdminLiveChatView['events'] {
  const at = row.createdAt.toISOString();
  const said = events.filter((event) => event.kind === 'message' && event.actor.kind === 'member' && event.at <= at).at(-1);
  if (!row.description.trim() || said?.body?.trim() === row.description.trim()) return events;
  const request: AdminLiveChatView['events'][number] = { id: `${row.id}_request`, kind: 'message', actor: { kind: 'member', person: member }, ...(row.openedByUserId ? { partyId: row.openedByUserId } : {}), body: row.description, at };
  return [...events, request].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** `/admin/live`: the queue, the chats under way, and the open one with its whole conversation. */
export async function getAdminLivePage(db: Db, staff: StaffActor, now: Date, { selected, agentsOnline }: { selected?: string; agentsOnline: number }): Promise<AdminLivePageData> {
  const canWork = staff.roles.some((role) => role === 'support_agent' || role === 'support_lead' || role === 'trust_safety' || role === 'admin');
  const lists = await consoleRows(db, staff);
  const chosen = selected ? await getAdminCase(db, staff, selected, now) : null;
  const [row] = chosen && selected ? await db.select().from(supportCases).where(eq(supportCases.id, selected)).limit(1) : [];
  let view: AdminLivePageData['selected'];
  if (chosen && row?.liveRequestedAt) {
    const member = chosen.data.parties.find((party) => party.person.id === row.openedByUserId)?.person;
    const agent = row.liveAgentUserId ? (await staffById(db, [row.liveAgentUserId])).get(row.liveAgentUserId) : undefined;
    const state = row.liveEndedAt || FINISHED.includes(row.status) ? 'ended' : row.liveJoinedAt ? 'joined' : 'waiting';
    const isMine = row.liveAgentUserId === staff.id;
    const replies = chosen.data.actions.includes('reply');
    const lead = staff.roles.includes('support_lead') || staff.roles.includes('admin');
    const person = member ?? { id: row.openedByUserId ?? '', displayName: '—', initials: '?', memberSince: row.createdAt.toISOString(), phoneVerified: false };
    view = {
      caseId: row.id,
      member: person,
      topic: topicOf(row.topic),
      status: chosen.data.case.status,
      state,
      ...(agent ? { agent } : {}),
      isMine,
      events: withRequest(chosen.data.events, row, person),
      canJoin: canWork && replies && state === 'waiting',
      // As `endLiveChat` allows: the one on it, a lead, or (nobody on it yet) anyone who answers it.
      canEnd: state !== 'ended' && (isMine || lead || (row.liveAgentUserId === null && replies)),
      // Join first, then chat: the one on it writes while it's live (the case page stays for everything else).
      canReply: replies && state === 'joined' && isMine,
      requestedAt: row.liveRequestedAt.toISOString(),
    };
  }
  // Someone who answers chats is online by being here (their own stream may connect a moment after this page renders).
  return { ...lists, ...(view ? { selected: view } : {}), agentsOnline: canWork ? Math.max(1, agentsOnline) : agentsOnline, canWork };
}
