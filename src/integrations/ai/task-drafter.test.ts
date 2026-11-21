import { describe, expect, it } from 'vitest';
import { validateTaskDetails } from '@/contracts';
import { createAiTaskDrafter, createFakeTaskDrafter } from './task-drafter';
import type { AiWriter } from './writer';

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

describe('AI task drafter', () => {
  it("writes in the page's language: Spanish for a Spanish page, English otherwise (sweep 2026-11-20, PT14)", async () => {
    const prompts: string[] = [];
    const writer: AiWriter = {
      name: 'stub',
      write: async ({ prompt }) => {
        prompts.push(prompt);
        return { title: 'Armar un escritorio', description: 'Necesito armar un escritorio en la sala.', details: {}, openQuestions: [] } as never;
      },
    };
    const ai = createAiTaskDrafter(writer);
    await ai.draft({ categorySlug: 'furniture-assembly', text: 'armar mi escritorio', locale: 'es' });
    await ai.draft({ categorySlug: 'furniture-assembly', text: 'build my desk' });
    expect(prompts[0]).toMatch(/^Language: Spanish$/m);
    expect(prompts[1]).toMatch(/^Language: English$/m);
  });

  it("never sends a model the poster's phone, email or street address: they're masked in the prompt", async () => {
    const prompts: string[] = [];
    const writer: AiWriter = {
      name: 'stub',
      write: async ({ prompt }) => {
        prompts.push(prompt);
        return { title: 'Assemble two bookshelves', description: 'Two flat-pack bookshelves to put together.', details: {}, openQuestions: [] } as never;
      },
    };
    await createAiTaskDrafter(writer).draft({
      categorySlug: 'furniture-assembly',
      text: 'two ikea bookshelves at 4401 SW 34th St Apt 12, text me at (352) 555-0199 or maya.r@example.com',
      locale: 'en',
    });
    expect(prompts[0]).toContain('two ikea bookshelves at [hidden], text me at [hidden] or [hidden]');
    expect(prompts[0]).not.toMatch(/4401|34th|555-0199|maya\.r|example\.com/);
  });
});
