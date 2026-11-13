import { describe, expect, it } from 'vitest';
import { readTaskIntent, suggestTitle } from './task-intent';

describe('readTaskIntent', () => {
  it.each([
    ['assemble an IKEA desk and two chairs', 'furniture-assembly'],
    ['Assemble an IKEA desk', 'furniture-assembly'],
    ['Mount two floating shelves above the TV', 'furniture-assembly'],
    ['Install apps on my smart TV', 'computer-help'],
    ['I need help to load a moving truck on Saturday', 'moving-help'],
    ['move my couch upstairs', 'moving-help'],
    ['I have a truck', 'moving-help'],
    ['rake and bag the leaves in the backyard', 'yard-cleanup'],
    ['weeding and pruning the front yard', 'yard-cleanup'],
    ['deep clean the kitchen before guests', 'light-cleaning'],
    ['tidy up my apartment', 'light-cleaning'],
    ['set up a new laptop', 'computer-help'],
    ['my wi-fi is slow, fix the router', 'computer-help'],
    ["I'm good with computers", 'computer-help'],
  ])('reads "%s" as %s', (text, category) => {
    const intent = readTaskIntent(text);
    expect(intent.category).toBe(category);
    expect(intent.confidence).toBeGreaterThan(0);
  });

  it('points nowhere for text that names no kind of help', () => {
    expect(readTaskIntent('hello there').category).toBeNull();
    expect(readTaskIntent('ab').category).toBeNull();
    expect(readTaskIntent('').matches).toEqual([]);
  });

  it('lists every category the text points to, best first, and is less sure on a tie', () => {
    const mixed = readTaskIntent('clean the yard');
    expect(mixed.matches.map((match) => match.category)).toEqual(expect.arrayContaining(['yard-cleanup', 'light-cleaning']));
    expect(mixed.confidence).toBeLessThan(readTaskIntent('rake the leaves in the yard').confidence);
  });

  it('matches whole words only', () => {
    // "pc" is not inside "space", "mac" not inside "machine".
    expect(readTaskIntent('space machine').category).toBeNull();
  });
});

describe('work the platform does not offer (blueprint 01)', () => {
  it.each([
    ['I need help to mount a TV on the wall', 'tv-mounting'],
    ['mount my 55 inch TV on drywall, I have the bracket', 'tv-mounting'],
    ['TV mounting please', 'tv-mounting'],
    ['fix a leaking faucet', 'licensed-trade'],
    ['replace a light fixture in the hallway', 'licensed-trade'],
    ['my water heater is broken', 'licensed-trade'],
  ])('reads "%s" as not offered (%s), with no category', (text, reason) => {
    const intent = readTaskIntent(text);
    expect(intent.notOffered).toBe(reason);
    expect(intent.category).toBeNull();
  });

  it('still reads TV stands, shelves near a TV, and smart-TV setup as the kinds of help they are', () => {
    expect(readTaskIntent('assemble a TV stand').category).toBe('furniture-assembly');
    expect(readTaskIntent('mount two floating shelves above the TV').notOffered).toBeUndefined();
    expect(readTaskIntent('set up a smart TV').category).toBe('computer-help');
  });
});

describe('suggestTitle', () => {
  it('drops the asking and keeps the task', () => {
    expect(suggestTitle('I need help to assemble an IKEA desk.')).toBe('Assemble an IKEA desk');
    expect(suggestTitle('can someone help me with raking leaves please')).toBe('Raking leaves');
    expect(suggestTitle('  assemble   an ikea desk ')).toBe('Assemble an ikea desk');
    expect(suggestTitle('Looking for someone to clean my oven!')).toBe('Clean my oven');
  });

  it('keeps titles short, on a word boundary', () => {
    const title = suggestTitle('assemble a very large wardrobe with sliding doors and a mirror and then mount the shelves above it in the hallway', 40);
    expect(title.length).toBeLessThanOrEqual(40);
    expect(title.endsWith('…')).toBe(true);
  });
});
