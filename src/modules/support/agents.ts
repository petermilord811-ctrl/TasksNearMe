import { inArray } from 'drizzle-orm';
import type { SupportAgentView } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import type { Db } from '@/platform/db/connect';

/**
 * People from support as a member sees them on a live chat (2026-11-23, owner: "see the agent's name and photo"): their
 * first name, and their profile photo or the first name's initial. Never a last name or an address. Someone without a
 * first name is left out (the conversation says "Support" for them).
 */
export function supportAgentViewOf(row: { firstName: string; avatarFileId: string | null }): SupportAgentView | undefined {
  const name = row.firstName.trim();
  if (!name) return undefined;
  const initial = Array.from(name)[0]?.toLocaleUpperCase('en-US') ?? '?';
  return { name, initials: initial, ...profilePhotoOf({ avatarFileId: row.avatarFileId, name }) };
}

export async function supportAgentsOf(db: Db, ids: readonly string[]): Promise<Map<string, SupportAgentView>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: users.id, firstName: users.firstName, avatarFileId: users.avatarFileId }).from(users).where(inArray(users.id, unique));
  return new Map(rows.flatMap((row) => {
    const view = supportAgentViewOf(row);
    return view ? [[row.id, view] as const] : [];
  }));
}
