import { describe, expect, it } from 'vitest';
import { deletedAccountLabel, deletedLabelFor, shownPerson } from './shown-name';

const maya = { status: 'active', name: 'Maya R.', firstName: 'Maya', lastName: 'Rivera' };
const gone = { status: 'deleted', name: 'Deleted account', firstName: 'Deleted', lastName: 'Account' };

describe('how a person shows to others (J-PR15)', () => {
  it('shows a person as they are', () => {
    expect(shownPerson(maya)).toEqual({ displayName: 'Maya R.', initials: 'MR' });
  });

  it("shows a deleted account in the reader's words, with their initials, flagged so nothing links to it", () => {
    expect(shownPerson(gone, 'Cuenta eliminada')).toEqual({ displayName: 'Cuenta eliminada', initials: 'CE', deleted: true });
    expect(shownPerson(gone)).toEqual({ displayName: 'Deleted account', initials: 'DA', deleted: true });
  });

  it("looks the words up only when someone was deleted, in the reader's language when given, English otherwise", async () => {
    expect(await deletedLabelFor([maya])).toBeUndefined();
    expect(await deletedLabelFor([maya, gone])).toBe('Deleted account');
    expect(await deletedLabelFor([gone], 'es')).toBe('Cuenta eliminada');
    expect(deletedAccountLabel()).toBe('Deleted account');
    expect(deletedAccountLabel('es')).toBe('Cuenta eliminada');
  });
});
