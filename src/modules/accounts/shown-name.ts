import 'server-only';
import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';

/** What deletion writes into the account (src/modules/privacy/requests.ts). */
const DELETED_ACCOUNT_EN = 'Deleted account';

/**
 * "Deleted account" in a reader's language (privacy rehearsal J-PR15): deletion writes the English words into the
 * account, so the person views put the reader's words in their place. Read from the catalog with an explicit language,
 * like the emails, never through the request's i18n config: these views also run in the job runner, from
 * instrumentation, where the request's language (next/root-params) can't be imported (a build error, 2026-11-21).
 * English unless the caller passes the reader's language.
 */
const labelIn = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.people' })('deletedAccount'));

export function deletedAccountLabel(locale: AppLocale = DEFAULT_LOCALE): string {
  return labelIn(locale);
}

/**
 * How a person shows to others: their name and initials, or for a deleted account `label` (the reader's "Deleted
 * account", from `deletedAccountLabel`), its initials, and `deleted`, so nothing links to a profile that's gone.
 */
export function shownPerson(user: { status: string; name: string; firstName: string; lastName: string }, label?: string): { displayName: string; initials: string; deleted?: true } {
  if (user.status !== 'deleted') return { displayName: user.name, initials: `${user.firstName.trim().charAt(0)}${user.lastName.trim().charAt(0)}`.toUpperCase() };
  const shown = label ?? DELETED_ACCOUNT_EN;
  const words = shown.trim().split(/\s+/);
  return { displayName: shown, initials: `${words[0]?.charAt(0) ?? ''}${words[1]?.charAt(0) ?? ''}`.toUpperCase(), deleted: true };
}

/** The label in `locale` when any of these people's accounts was deleted, otherwise nothing to look up. */
export async function deletedLabelFor(people: readonly { status: string }[], locale?: AppLocale): Promise<string | undefined> {
  return people.some((person) => person.status === 'deleted') ? deletedAccountLabel(locale) : undefined;
}
