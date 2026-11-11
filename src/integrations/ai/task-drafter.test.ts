import { describe, expect, it } from 'vitest';
import { validateTaskDetails } from '@/contracts';
import { createFakeTaskDrafter } from './task-drafter';

const drafter = createFakeTaskDrafter();

describe('rule-based task drafter', () => {
  it('turns plain words into a structured furniture draft', async () => {
    const draft = await drafter.draft({
      categorySlug: 'furniture-assembly',
      text: 'need my desk built, box is in the living room on the 2nd floor, no elevator',
    });
    expect(draft.title).toBe('Assemble a flat-pack desk');
    expect(draft.description).toBe('Need my desk built, box is in the living room on the 2nd floor, no elevator.');
    expect(draft.details).toEqual({ itemType: 'desk', itemCount: 1, floor: 2, elevator: false });
    expect(draft.openQuestions).toContain('Should it be anchored to the wall?');
    expect(draft.openQuestions).not.toContain('What are you having assembled?');
  });

  it.each([
    ['moving-help', 'Two of us need help to load the truck, 2 bedroom apartment, 1 flight of stairs', 'Help loading a moving truck', { moveType: 'load_truck', rooms: 2, stairFlights: 1 }],
    ['yard-cleanup', 'medium yard full of oak leaves, I have a rake', 'Rake and bag leaves in a medium yard', { yardSize: 'medium', work: 'leaves', toolsOnSite: true }],
    ['light-cleaning', '2 bedroom 1 bath apartment, supplies are under the sink, one cat', 'Light cleaning for a 2-bedroom home', { bedrooms: 2, bathrooms: 1, suppliesOnSite: true, pets: true }],
    ['computer-help', 'set up my new printer so it works with my laptop', 'Set up my printer', { device: 'printer', need: 'setup' }],
  ] as const)('%s', async (categorySlug, text, title, details) => {
    const draft = await drafter.draft({ categorySlug, text });
    expect(draft.title).toBe(title);
    expect(draft.details).toEqual(details);
    expect(validateTaskDetails(categorySlug, draft.details)).not.toHaveProperty(Object.keys(details)[0]!);
  });

  it('always returns a usable title and description', async () => {
    const draft = await drafter.draft({ categorySlug: 'computer-help', text: 'help' });
    expect(draft.title.length).toBeGreaterThanOrEqual(4);
    expect(draft.description.length).toBeGreaterThanOrEqual(20);
    expect(draft.openQuestions.length).toBeGreaterThan(0);
  });
});
