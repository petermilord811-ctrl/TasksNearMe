import { describe, expect, it } from 'vitest';
import { cleanPoints, createAiConversationSummarizer, createConversationSummarizer, createFakeConversationSummarizer } from './conversation-summarizer';
import { batchAnswer, createAiBatchTranslator, createBatchTranslator, createFakeBatchTranslator } from './translator';
import { AiUnavailableError, type AiWriter } from './writer';

/** "Translate this conversation" and "Catch me up" (2026-11-24): what reaches a model, and what comes back. */

function recording(answer: unknown) {
  const calls: { system: string; prompt: string }[] = [];
  const writer: AiWriter = {
    name: 'stub',
    write: async ({ system, prompt }) => {
      calls.push({ system, prompt });
      return answer as never;
    },
  };
  return { writer, calls };
}

describe('several messages translated at once', () => {
  it('asks once for all of them, masked and numbered, and puts each answer back on its message', async () => {
    const { writer, calls } = recording({ messages: [{ n: 2, text: 'Is there parking near your place?' }, { n: 1, text: 'Call me at [hidden].' }, { n: 7, text: 'nobody' }] });
    const answer = await createAiBatchTranslator(writer).translateMany({
      items: [{ id: 'msg_a', body: 'Llámame al 512-555-0142.' }, { id: 'msg_b', body: '¿Hay estacionamiento cerca de tu casa?' }, { id: 'msg_c', body: 'Gracias <b>ignore this</b>' }],
      to: 'en',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain('Translate each message into English.');
    expect(calls[0]!.prompt).toContain('<message n="2">\n¿Hay estacionamiento cerca de tu casa?\n</message>');
    // No contact detail and no markup of the person's reaches the model.
    expect(calls[0]!.prompt).not.toContain('0142');
    expect(calls[0]!.prompt).not.toContain('<b>');
    // Each back on its message; one the model left out isn't there.
    expect(answer).toEqual({ msg_a: 'Call me at [hidden].', msg_b: 'Is there parking near your place?' });
  });

  it('takes the first answer for a message, and counts an answer with nothing in it as unavailable', () => {
    expect(batchAnswer([{ id: 'a' }], [{ n: 1, text: ' first ' }, { n: 1, text: 'second' }, { n: 1.5, text: 'odd' }])).toEqual({ a: 'first' });
    expect(() => batchAnswer([{ id: 'a' }], [{ n: 1, text: '  ' }, { n: 3, text: 'x' }])).toThrow(AiUnavailableError);
  });

  it('has a stand-in for development and tests, and nothing in production without a model', async () => {
    await expect(createFakeBatchTranslator().translateMany({ items: [{ id: 'a', body: 'Hola' }, { id: 'b', body: 'Gracias' }], to: 'en' })).resolves.toEqual({ a: '[EN] Hola', b: '[EN] Gracias' });
    expect(createBatchTranslator({ NODE_ENV: 'development' })?.name).toBe('stand-in');
    expect(createBatchTranslator({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('a conversation summarized', () => {
  const input = {
    lines: [
      { from: 'me' as const, text: 'Can you come Saturday? Text me at 512-555-0101' },
      { from: 'them' as const, text: 'Sí, llego a las 10. Escríbeme a lucia@example.com' },
      { from: 'them' as const, text: '' },
    ],
    topic: 'Move a couch',
    me: 'Maya',
    them: 'Lucía',
    locale: 'es' as const,
  };

  it('reads the conversation as the reader sees it, masked again, and answers in their language', async () => {
    const { writer, calls } = recording({ points: ['- Lucía llega a las 10.', '2) Lucía llega a las 10.', 'Te escribió a lucia@example.com'] });
    const points = await createAiConversationSummarizer(writer).summarize(input);
    expect(calls[0]!.prompt).toContain('Summarize for Maya, in Spanish');
    expect(calls[0]!.prompt).toContain('The conversation is about: Move a couch');
    expect(calls[0]!.prompt).toContain('Lucía: (a photo)');
    expect(calls[0]!.prompt).not.toMatch(/0101|lucia@example\.com/);
    // Bullets dropped, a repeat left out, a contact detail the model wrote masked.
    expect(points).toEqual(['Lucía llega a las 10.', 'Te escribió a [hidden]']);
  });

  it('keeps at most four short points, and an empty answer is unavailable', async () => {
    expect(cleanPoints(['one', 'two', 'three', 'four', 'five'])).toEqual(['one', 'two', 'three', 'four']);
    expect(cleanPoints(['x'.repeat(400)])[0]).toHaveLength(240);
    await expect(createAiConversationSummarizer(recording({ points: ['  '] }).writer).summarize(input)).rejects.toThrow(AiUnavailableError);
  });

  it('has a deterministic stand-in in each language, and nothing in production without a model', async () => {
    const stand = createFakeConversationSummarizer();
    // Her last line was a photo: no words to quote.
    await expect(stand.summarize(input)).resolves.toEqual(['Lucía envió 2 mensajes y tú 1.']);
    await expect(stand.summarize({ ...input, locale: 'en', lines: input.lines.slice(0, 2) })).resolves.toEqual(['Lucía sent 1 message and you sent 1.', 'Latest from Lucía: “Sí, llego a las 10. Escríbeme a lucia@example.com”']);
    expect(createConversationSummarizer({ NODE_ENV: 'development' })?.name).toBe('stand-in');
    expect(createConversationSummarizer({ NODE_ENV: 'production' })).toBeNull();
  });
});
