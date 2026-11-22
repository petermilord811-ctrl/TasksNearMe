import { describe, expect, it } from 'vitest';
import { normalizeUsername, USERNAME_PATTERN } from '@/contracts';
import { usernameBase, usernameChangeableAt, usernameProblem } from './usernames';

describe('usernames (2026-11-22)', () => {
  it('suggests one from the first name: accents folded, letters and digits only, 15 at most', () => {
    expect(usernameBase('Maya')).toBe('maya');
    expect(usernameBase('José María')).toBe('josemaria');
    expect(usernameBase("D'Andre")).toBe('dandre');
    expect(usernameBase('Bartholomewbartholomew')).toBe('bartholomewbart');
    expect(usernameBase('Núñez')).toBe('nunez');
  });

  it('falls back to "neighbor" for names too short, starting with a digit, without Latin letters, or reserved', () => {
    for (const name of ['Al', '2Pac', '李', '', 'Admin', 'Support']) expect(usernameBase(name)).toBe('neighbor');
  });

  it('every suggestion, numbered or not, is a valid username', () => {
    for (const name of ['Maya', 'Bartholomewbartholomew', 'Al', 'Ruth']) {
      const base = usernameBase(name);
      expect(USERNAME_PATTERN.test(base)).toBe(true);
      expect(USERNAME_PATTERN.test(`${base}_1234`)).toBe(true);
    }
  });

  it('reads what people type: "@" and capitals are fine, the stored form is lowercase', () => {
    expect(normalizeUsername('  @Maya_R ')).toBe('maya_r');
    expect(normalizeUsername('MAYA')).toBe('maya');
  });

  it('says why one cannot be used: the pattern, or a word that passes for the company or its staff', () => {
    expect(usernameProblem('maya_r')).toBeNull();
    expect(usernameProblem('ab')).toBe('invalid');
    expect(usernameProblem('1maya')).toBe('invalid');
    expect(usernameProblem('maya-r')).toBe('invalid');
    expect(usernameProblem('a'.repeat(21))).toBe('invalid');
    expect(usernameProblem('support')).toBe('name_reserved');
    expect(usernameProblem('tasksnearme_help')).toBe('name_reserved');
  });

  it('lets people choose another once every 30 days', () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    expect(usernameChangeableAt(null, now)).toBeNull();
    expect(usernameChangeableAt(new Date('2026-11-01T12:00:00.000Z'), now)?.toISOString()).toBe('2026-12-01T12:00:00.000Z');
    expect(usernameChangeableAt(new Date('2026-10-23T12:00:00.000Z'), now)).toBeNull();
  });
});
