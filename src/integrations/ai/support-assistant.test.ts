import { describe, expect, it } from 'vitest';
import type { AiWriter } from './writer';
import { createAiSupportAssistant, createFakeSupportAssistant, guessTopic, tidyAssistantAnswer, type AssistantFacts } from './support-assistant';

const article = { slug: 'when-am-i-charged', title: 'When am I charged?', summary: 'Your card is charged when you book a helper.', text: 'Your card is charged when you book.' };
const facts = (question: string, overrides: Partial<AssistantFacts> = {}): AssistantFacts => ({ locale: 'en', mode: 'poster', articles: [article], otherArticles: [{ slug: 'cancel-a-booking', title: 'Canceling a booking' }], earlier: [], question, ...overrides });

describe('the support assistant', () => {
  it('cleans an answer: no contact details or markdown, known sources only, a summary always', () => {
    const tidy = tidyAssistantAnswer(
      { text: '## Charges\n* **Call** 352-555-0134 or write to help@example.com\n\n\n\nThen wait.', sources: ['when-am-i-charged', 'made-up', 'when-am-i-charged', 'cancel-a-booking'], handoff: 'none', topic: 'payment', summary: '  ' },
      facts('When am I charged?'),
    );
    expect(tidy.text).not.toMatch(/352-555-0134|help@example\.com|\*\*|##/);
    expect(tidy.text).toContain('- Call');
    expect(tidy.text).not.toMatch(/\n{3,}/);
    expect(tidy.sources).toEqual(['when-am-i-charged', 'cancel-a-booking']);
    expect(tidy.summary).toBe('When am I charged?');
  });

  it('cuts a long answer at a sentence, and refuses an empty one', () => {
    const long = `${'This is a sentence about charges. '.repeat(60)}`;
    const tidy = tidyAssistantAnswer({ text: long, sources: [], handoff: 'none', topic: 'payment', summary: 'x' }, facts('q'));
    expect(tidy.text.length).toBeLessThanOrEqual(1200);
    expect(tidy.text.endsWith('.')).toBe(true);
    expect(() => tidyAssistantAnswer({ text: ' ', sources: [], handoff: 'none', topic: 'other', summary: '' }, facts('q'))).toThrow();
  });

  it('asks a model with the articles and the question masked, inside their tags', async () => {
    let seen = '';
    const writer: AiWriter = {
      name: 'test',
      async write(input) {
        seen = input.prompt;
        return input.schema.parse({ answer: 'Your card is charged when you book.', sources: ['when-am-i-charged'], handoff: 'none', topic: 'payment', summary: 'Asked about charges.' });
      },
    };
    const answer = await createAiSupportAssistant(writer).answer(facts('When am I charged? My number is 352-555-0134', { earlier: [{ question: 'hi', answer: 'Hello!' }] }));
    expect(answer.sources).toEqual(['when-am-i-charged']);
    expect(seen).toContain('<question>');
    expect(seen).toContain('<article slug="when-am-i-charged"');
    expect(seen).toContain('Q: hi');
    expect(seen).not.toContain('352-555-0134');
  });

  it('stands in without a model: the best article, a person when asked, 911 first when someone may be in danger', async () => {
    const fake = createFakeSupportAssistant();
    const plain = await fake.answer(facts('When am I charged?'));
    expect(plain).toMatchObject({ handoff: 'none', sources: ['when-am-i-charged'], topic: 'payment' });
    expect(plain.text).toContain(article.summary);
    expect((await fake.answer(facts('I want a refund, can I talk to a person?'))).handoff).toBe('suggest');
    const urgent = await fake.answer(facts('Someone is threatening me', { articles: [] }));
    expect(urgent).toMatchObject({ handoff: 'urgent', topic: 'safety' });
    expect(urgent.text).toMatch(/^If anyone is in danger right now, call 911/);
    expect((await fake.answer(facts('¿Cuándo me cobran?', { locale: 'es' }))).text).toContain('Hay más en');
    expect((await fake.answer(facts('purple elephants', { articles: [] }))).handoff).toBe('suggest');
  });

  it('guesses the support topic from plain words', () => {
    expect(guessTopic('my card was charged twice')).toBe('payment');
    expect(guessTopic("I can't sign in to my account")).toBe('account');
    expect(guessTopic('the helper is late for my booking')).toBe('booking');
    expect(guessTopic('a scam message')).toBe('safety');
    expect(guessTopic('hello')).toBe('other');
  });
});
