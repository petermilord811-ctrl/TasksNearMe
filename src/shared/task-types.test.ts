import { describe, expect, it } from 'vitest';
import { CATEGORY_DETAIL_FIELDS, CATEGORY_SLUGS } from '@/contracts';
import { isTaskType, taskTypeOf, taskTypesFor } from './task-types';

describe('task types under categories', () => {
  it('reads the type from the task’s own details', () => {
    expect(taskTypeOf('furniture-assembly', { itemType: 'desk', itemCount: 1 })).toBe('desk');
    expect(taskTypeOf('furniture-assembly', { itemType: 'chairs', itemCount: 4 })).toBe('table');
    expect(taskTypeOf('moving-help', { moveType: 'load_and_unload' })).toBe('load_and_unload');
    expect(taskTypeOf('yard-cleanup', { yardSize: 'large', work: 'debris' })).toBe('debris');
    expect(taskTypeOf('light-cleaning', { bedrooms: 0, bathrooms: 1 })).toBe('studio_one');
    expect(taskTypeOf('light-cleaning', { bedrooms: 2 })).toBe('two_bedroom');
    expect(taskTypeOf('light-cleaning', { bedrooms: 5 })).toBe('three_plus');
    expect(taskTypeOf('computer-help', { device: 'wifi_router', need: 'fix' })).toBe('wifi');
    expect(taskTypeOf('computer-help', {})).toBeUndefined();
    expect(taskTypeOf('light-cleaning', null)).toBeUndefined();
  });

  it('gives every choice the posting form offers exactly one type', () => {
    for (const category of CATEGORY_SLUGS) {
      const types = taskTypesFor(category);
      expect(new Set(types.map((type) => type.slug)).size, category).toBe(types.length);
      for (const type of types) {
        const field = CATEGORY_DETAIL_FIELDS[category].find((candidate) => candidate.key === type.field);
        expect(field, `${category}.${type.field}`).toBeDefined();
      }
      const decidingField = CATEGORY_DETAIL_FIELDS[category].find((field) => field.key === types[0]!.field)!;
      if (decidingField.kind === 'choice') {
        for (const option of decidingField.options) {
          expect(types.filter((type) => type.values?.includes(option)), `${category} ${option}`).toHaveLength(1);
        }
      }
      if (decidingField.kind === 'count') {
        for (let count = decidingField.min; count <= decidingField.max; count++) {
          expect(taskTypeOf(category, { [decidingField.key]: count }), `${category} ${count}`).toBeDefined();
        }
      }
    }
  });

  it('knows which slugs belong to a category', () => {
    expect(isTaskType('furniture-assembly', 'desk')).toBe(true);
    expect(isTaskType('furniture-assembly', 'leaves')).toBe(false);
  });
});
