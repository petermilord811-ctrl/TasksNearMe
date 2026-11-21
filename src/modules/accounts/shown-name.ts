import 'server-only';
import { getTranslations } from 'next-intl/server';

/** What deletion writes into the account (src/modules/privacy/requests.ts), shown where no reader's language is in reach. */
const DELETED_ACCOUNT_EN = 'Deleted account';

/**
 * "Deleted account" in the reader's language (privacy rehearsal J-PR15): deletion writes the English words into the
 * account, so the person views put the reader's own words in their place. The page's language (in a Server Action,
 * the device's); English where no request is in reach (jobs, tests).
 */
export async function deletedAccountLabel(): Promise<string> {
  try {
    const t = await getTranslations('server.people');
    return t('deletedAccount');
  } catch {
    return DELETED_ACCOUNT_EN;
  }
}

/**
 * How a person shows to others: their name and initials, or for a deleted account `label` (the reader's "Deleted
 * account", from `deletedAccountLabel`), its initials, and `deleted`, so nothing links to a profile that's gone.
 */
export function shownPerson(user: { status: string; name: string; firstName: string; lastName: string }, label?: string): { displayName: string; initials: string; deleted?: true } {
  if (user.status !== 'deleted') return { displayName: user.name, initials: `${user.firstName.trim().charAt(0)}${user.lastName.trim().charAt(0)}`.toUpperCase() };
  const words = (label ?? DELETED_ACCOUNT_EN).trim().split(/\s+/);
  return { displayName: label ?? DELETED_ACCOUNT_EN, initials: `${words[0]?.charAt(0) ?? ''}${words[1]?.charAt(0) ?? ''}`.toUpperCase(), deleted: true };
}

/** The label when any of these people's accounts was deleted, otherwise nothing to look up. */
export async function deletedLabelFor(people: readonly { status: string }[]): Promise<string | undefined> {
  return people.some((person) => person.status === 'deleted') ? deletedAccountLabel() : undefined;
}
