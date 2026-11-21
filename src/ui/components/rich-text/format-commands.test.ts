import { describe, expect, it } from 'vitest';
import { continueListOnEnter, formatEdit, type TextEdit } from './format-commands';

/** The value after an edit, with the selection marked as [ ]. */
function apply(value: string, edit: TextEdit): string {
  const next = value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
  return `${next.slice(0, edit.selectionStart)}[${next.slice(edit.selectionStart, edit.selectionEnd)}]${next.slice(edit.selectionEnd)}`;
}

/** `text` with the selection written as [ ] → the value and its selection. */
function at(text: string): [string, number, number] {
  const start = text.indexOf('[');
  const end = text.indexOf(']') - 1;
  return [text.replace('[', '').replace(']', ''), start, end];
}

const run = (text: string, format: Parameters<typeof formatEdit>[3]) => {
  const [value, start, end] = at(text);
  return apply(value, formatEdit(value, start, end, format));
};

describe('formatEdit: bold and italic', () => {
  it('wraps the selection, keeping edge spaces outside', () => {
    expect(run('fix the [loud fan ]now', 'bold')).toBe('fix the **[loud fan]** now');
    expect(run('fix the [fan]', 'italic')).toBe('fix the *[fan]*');
  });

  it('takes the marks off when they are already there, around or inside the selection', () => {
    expect(run('a **[fan]** b', 'bold')).toBe('a [fan] b');
    expect(run('a [**fan**] b', 'bold')).toBe('a [fan] b');
    expect(run('a *[fan]* b', 'italic')).toBe('a [fan] b');
  });

  it('keeps bold and italic apart', () => {
    expect(run('a **[fan]** b', 'italic')).toBe('a ***[fan]*** b');
    expect(run('a ***[fan]*** b', 'bold')).toBe('a *[fan]* b');
    expect(run('a ***[fan]*** b', 'italic')).toBe('a **[fan]** b');
  });

  it('puts the caret between new marks when nothing is selected', () => {
    expect(run('a []', 'bold')).toBe('a **[]**');
  });
});

describe('formatEdit: headings and lists', () => {
  it('prefixes the caret’s line, and takes it off again', () => {
    expect(run('Intro\nWhat []needs doing', 'heading')).toBe('Intro\n## What needs doing[]');
    expect(run('## What []needs doing', 'heading')).toBe('What needs doing[]');
  });

  it('numbers or bullets every selected line, skipping blank ones', () => {
    expect(run('[one\n\ntwo\nthree]', 'numbers')).toBe('[1. one\n\n2. two\n3. three]');
    expect(run('[1. one\n2. two]', 'bullets')).toBe('[- one\n- two]');
    expect(run('[- one\n- two]', 'bullets')).toBe('[one\ntwo]');
  });

  it('starts an empty item on an empty line', () => {
    expect(run('[]', 'bullets')).toBe('- []');
    expect(run('Intro\n[]', 'numbers')).toBe('Intro\n1. []');
  });

  it('doesn’t take in the next line when the selection ends at a line break', () => {
    expect(run('[one\n]two', 'bullets')).toBe('[- one]\ntwo');
  });
});

describe('continueListOnEnter', () => {
  const enter = (text: string) => {
    const [value, start, end] = at(text);
    const edit = continueListOnEnter(value, start, end);
    return edit ? apply(value, edit) : null;
  };

  it('starts the next item', () => {
    expect(enter('- one[]')).toBe('- one\n- []');
    expect(enter('1. one[]')).toBe('1. one\n2. []');
    expect(enter('  9) nine[]\nafter')).toBe('  9) nine\n  10) []\nafter');
  });

  it('ends the list on an empty item', () => {
    expect(enter('- one\n- []')).toBe('- one\n[]');
  });

  it('leaves other lines, and the middle of an item, to the browser', () => {
    expect(enter('plain[]')).toBeNull();
    expect(enter('- on[]e')).toBeNull();
    expect(enter('- [one]')).toBeNull();
  });
});
