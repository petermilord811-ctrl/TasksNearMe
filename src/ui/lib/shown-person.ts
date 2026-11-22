import { useTranslations } from 'next-intl';

/** Someone a page names: their name and initials, and `deleted` once their account is gone (privacy rehearsal J-PR15). */
export interface NamedPerson {
  displayName: string;
  initials: string;
  deleted?: true;
}

/** The initials of a label such as "Deleted account" or "Cuenta eliminada". */
export function labelInitials(label: string): string {
  const words = label.trim().split(/\s+/);
  return `${words[0]?.charAt(0) ?? ''}${words[1]?.charAt(0) ?? ''}`.toUpperCase();
}

/**
 * A person as this page names them: a deleted account becomes the page's own "Deleted account", with its initials.
 * The server flags the account (`deleted`), but where no request is in reach (the job runner builds the same views) it
 * can only write the words in English, so the page says them in its language.
 */
export function useShownPerson(): <P extends NamedPerson>(person: P) => P {
  const t = useTranslations('common');
  return <P extends NamedPerson>(person: P): P => {
    if (!person.deleted) return person;
    const label = t('deletedAccount');
    return { ...person, displayName: label, initials: labelInitials(label) };
  };
}
