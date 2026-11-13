import { describe, expect, it } from 'vitest';
import { EVIDENCE_CHECKLISTS } from '@/contracts';
import { checklistAnswers, checklistFor, checklistView } from './checklist';

describe('evidence checklists', () => {
  it('gives each category its own list, and none to a category without one', () => {
    expect(checklistFor('furniture-assembly')).toEqual(EVIDENCE_CHECKLISTS['furniture-assembly']);
    expect(checklistFor('moving-help')).toEqual(['placed_where_asked', 'nothing_damaged', 'load_secured']);
    expect(checklistFor('pet-sitting')).toEqual([]);
  });

  it('stores every item of the category, ticked or not, and drops anything else', () => {
    const keys = checklistFor('moving-help');
    expect(checklistAnswers(keys, undefined)).toEqual({ placed_where_asked: false, nothing_damaged: false, load_secured: false });
    expect(checklistAnswers(keys, { nothing_damaged: true, load_secured: false, made_up: true })).toEqual({ placed_where_asked: false, nothing_damaged: true, load_secured: false });
    expect(checklistAnswers([], { nothing_damaged: true })).toEqual({});
  });

  it('shows the answers in the category order, whatever order they were stored in', () => {
    expect(checklistView('moving-help', { load_secured: true, placed_where_asked: true, nothing_damaged: false })).toEqual({
      categorySlug: 'moving-help',
      items: [{ key: 'placed_where_asked', done: true }, { key: 'nothing_damaged', done: false }, { key: 'load_secured', done: true }],
    });
  });

  it('shows nothing for work sent before checklists, or for a category without one', () => {
    expect(checklistView('moving-help', {})).toBeUndefined();
    expect(checklistView('moving-help', null)).toBeUndefined();
    expect(checklistView('pet-sitting', { load_secured: true })).toBeUndefined();
  });

  it('shows only the items that were asked when the work was sent', () => {
    expect(checklistView('moving-help', { nothing_damaged: true, retired_item: true })).toEqual({ categorySlug: 'moving-help', items: [{ key: 'nothing_damaged', done: true }] });
  });
});
