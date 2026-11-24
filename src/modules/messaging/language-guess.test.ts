import { describe, expect, it } from 'vitest';
import { guessLanguage, needsTranslation } from './language-guess';

/** "Translate this conversation" skips what the reader can already read (2026-11-24): a cheap guess, no model. */
describe('guessing a message’s language', () => {
  it.each([
    ['Hi Hal! Could you do mine on Saturday?', 'en'],
    ['Perfect, I will be there at 10.', 'en'],
    ['Thanks!', 'en'],
    ['Can you come to José’s house on Saturday at the plaza?', 'en'],
    ['¡Hola Maya! Sí, claro. ¿A qué hora te viene bien?', 'es'],
    ['Llevo una carretilla y correas, no te preocupes.', 'es'],
    ['Gracias', 'es'],
    ['Bonjour à tous', 'unknown'],
    ['👍', 'none'],
    ['10:30 [hidden]', 'unknown'],
    ['12:45', 'none'],
  ] as const)('%s: %s', (text, guess) => {
    expect(guessLanguage(text)).toBe(guess);
  });

  it('needs translating only what the reader can’t already read', () => {
    expect(needsTranslation('¿Hay estacionamiento cerca de tu casa?', 'en')).toBe(true);
    expect(needsTranslation('¿Hay estacionamiento cerca de tu casa?', 'es')).toBe(false);
    expect(needsTranslation('Is there parking near your place?', 'en')).toBe(false);
    expect(needsTranslation('Is there parking near your place?', 'es')).toBe(true);
    // Another language, or too little to tell: translated (the model gives back what's already in the reader's language).
    expect(needsTranslation('Bonjour à tous', 'en')).toBe(true);
    expect(needsTranslation('👍', 'es')).toBe(false);
  });
});
