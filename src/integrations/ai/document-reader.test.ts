import { describe, expect, it, vi } from 'vitest';
import type { ClaudeClient } from './claude';
import { AiRefusedError, AiUnavailableError } from './writer';
import { createClaudeDocumentReader, createStandInDocumentReader, documentReaderFromEnv, type AddressDocumentInput } from './document-reader';

/** An SDK client whose `messages.parse` answers with what the test says. */
function stubClient(answer: { parsed_output?: unknown; stop_reason?: string } | Error) {
  const parse = vi.fn(async (_params: Record<string, unknown>) => {
    if (answer instanceof Error) throw answer;
    return { stop_reason: 'end_turn', ...answer };
  });
  return { client: { messages: { parse } } as unknown as ClaudeClient, parse };
}

const input = (contentType = 'image/webp'): AddressDocumentInput => ({
  document: { bytes: Buffer.from('not really a document'), contentType },
  expected: { name: 'Jordan Lee', address: '1100 Congress Ave, Austin, TX 78701', declaredType: 'utility_bill', submittedOn: '2026-11-12' },
});

describe('the proof-of-address reader', () => {
  it('sends the photo with the expected name and address, and keeps only the answers', async () => {
    const { client, parse } = stubClient({ parsed_output: { readable: true, documentType: 'utility_bill', nameMatches: true, addressMatches: false, datedWithin90Days: null } });
    const reader = createClaudeDocumentReader({ client, model: 'claude-opus-5-5' });
    expect(reader.name).toBe('claude:claude-opus-5-5');
    await expect(reader.read(input())).resolves.toEqual({ readable: true, documentType: 'utility_bill', nameMatches: true, addressMatches: false });
    const params = parse.mock.calls[0]![0] as { messages: { content: Array<{ type: string; source?: { media_type: string; data: string }; text?: string }> }[]; output_config: { effort: string } };
    const [attachment, prompt] = params.messages[0]!.content;
    expect(attachment).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: Buffer.from('not really a document').toString('base64') } });
    expect(prompt!.text).toContain('Expected name: Jordan Lee');
    expect(prompt!.text).toContain('Expected address: 1100 Congress Ave, Austin, TX 78701');
    expect(params.output_config.effort).toBe('low');
  });

  it('sends PDFs as documents, and skips what it cannot read', async () => {
    const { client, parse } = stubClient({ parsed_output: { readable: false, documentType: 'other', nameMatches: null, addressMatches: null, datedWithin90Days: null } });
    const reader = createClaudeDocumentReader({ client, model: 'm' });
    await expect(reader.read(input('application/pdf'))).resolves.toEqual({ readable: false });
    expect((parse.mock.calls[0]![0] as { messages: { content: Array<{ type: string }> }[] }).messages[0]!.content[0]!.type).toBe('document');
    await expect(reader.read(input('image/heic'))).resolves.toEqual({ readable: false });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('reads a refusal as refused, and other failures as unavailable', async () => {
    await expect(createClaudeDocumentReader({ client: stubClient({ stop_reason: 'refusal', parsed_output: null }).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiRefusedError);
    await expect(createClaudeDocumentReader({ client: stubClient({ stop_reason: 'max_tokens', parsed_output: null }).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(createClaudeDocumentReader({ client: stubClient(new Error('network')).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('is Claude with a key, the stand-in without one, and nothing in production without one', async () => {
    expect(documentReaderFromEnv({ ANTHROPIC_API_KEY: 'sk-test', NODE_ENV: 'production' })?.name).toBe('claude:claude-opus-5-5');
    expect(documentReaderFromEnv({ NODE_ENV: 'development' })?.name).toBe('stand-in');
    expect(documentReaderFromEnv({ NODE_ENV: 'production' })).toBeNull();
    await expect(createStandInDocumentReader().read(input())).resolves.toEqual({ readable: true, documentType: 'utility_bill' });
  });
});
