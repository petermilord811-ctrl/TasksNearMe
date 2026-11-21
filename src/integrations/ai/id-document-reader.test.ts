import { describe, expect, it, vi } from 'vitest';
import { AiRefusedError, AiUnavailableError } from './writer';
import { createClaudeIdReader, createStandInIdReader, idReaderFromEnv, type ClaudeBetaClient, type IdDocumentInput } from './id-document-reader';

/** An SDK client whose `beta.messages.parse` answers with what the test says. */
function stubClient(answer: { parsed_output?: unknown; stop_reason?: string } | Error) {
  const parse = vi.fn(async (_params: Record<string, unknown>) => {
    if (answer instanceof Error) throw answer;
    return { stop_reason: 'end_turn', ...answer };
  });
  return { client: { beta: { messages: { parse } } } as unknown as ClaudeBetaClient, parse };
}

// With the back too: only the server's reader reads its barcode; Claude is sent the front alone.
const input = (contentType = 'image/webp'): IdDocumentInput => ({ document: { bytes: Buffer.from('not really an ID'), contentType }, back: { bytes: Buffer.from('not really a back'), contentType }, declaredType: 'drivers_license' });
const full = { readable: true, documentType: 'drivers_license', givenNames: ' Vera Lynn ', surname: 'Tester', dateOfBirth: '1990-04-02', expiryDate: '2029-04-02', issuingState: 'tx', documentNumber: ' 12345678 ' };

describe('the ID reader', () => {
  it('sends only the photo of the front with the declared type, and returns what it read', async () => {
    const { client, parse } = stubClient({ parsed_output: full });
    const reader = createClaudeIdReader({ client, model: 'claude-opus-5-5' });
    expect(reader.name).toBe('claude:claude-opus-5-5');
    await expect(reader.read(input())).resolves.toEqual({ readable: true, documentType: 'drivers_license', givenNames: 'Vera Lynn', surname: 'Tester', dateOfBirth: '1990-04-02', expiryDate: '2029-04-02', issuingState: 'TX', documentNumber: '12345678' });
    const params = parse.mock.calls[0]![0] as {
      system: string;
      messages: { content: Array<{ type: string; source?: { media_type: string; data: string }; text?: string }> }[];
      output_config: { effort: string };
      fallbacks: unknown;
      betas: string[];
    };
    const content = params.messages[0]!.content;
    // One image (the front), never the selfie, and no face comparison asked for.
    expect(content.filter((block) => block.type === 'image')).toHaveLength(1);
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: Buffer.from('not really an ID').toString('base64') } });
    expect(content[1]!.text).toContain('drivers license');
    // The number too (6.3), for the keyed hash that spots the same ID on two accounts.
    expect(content[1]!.text).toContain('the document number');
    expect(params.system).toContain('do not compare faces');
    expect(params.output_config.effort).toBe('low');
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
  });

  it('leaves out what it could not read, and skips what it cannot open', async () => {
    const { client, parse } = stubClient({ parsed_output: { ...full, givenNames: null, surname: '  ', dateOfBirth: null, documentNumber: null } });
    const reader = createClaudeIdReader({ client, model: 'm' });
    await expect(reader.read(input())).resolves.toEqual({ readable: true, documentType: 'drivers_license', expiryDate: '2029-04-02', issuingState: 'TX' });
    await expect(reader.read(input('image/heic'))).resolves.toEqual({ readable: false });
    expect(parse).toHaveBeenCalledTimes(1);
    const unreadable = createClaudeIdReader({ client: stubClient({ parsed_output: { ...full, readable: false } }).client, model: 'm' });
    await expect(unreadable.read(input())).resolves.toEqual({ readable: false });
  });

  it('reads a refusal as refused, and other failures as unavailable', async () => {
    await expect(createClaudeIdReader({ client: stubClient({ stop_reason: 'refusal', parsed_output: null }).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiRefusedError);
    await expect(createClaudeIdReader({ client: stubClient({ stop_reason: 'max_tokens', parsed_output: null }).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(createClaudeIdReader({ client: stubClient({ parsed_output: null }).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(createClaudeIdReader({ client: stubClient(new Error('network')).client, model: 'm' }).read(input())).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("is the server's own reader everywhere, and Claude only when chosen with a key", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(idReaderFromEnv({ NODE_ENV: 'production' }).name).toBe('server:ocr');
    expect(idReaderFromEnv({ NODE_ENV: 'development' }).name).toBe('server:ocr');
    // A key alone changes nothing: the owner chose the server (2026-11-21).
    expect(idReaderFromEnv({ ANTHROPIC_API_KEY: 'sk-test', NODE_ENV: 'production', DOCUMENT_READER: '' }).name).toBe('server:ocr');
    expect(idReaderFromEnv({ ANTHROPIC_API_KEY: 'sk-test', NODE_ENV: 'production', DOCUMENT_READER: 'claude' }).name).toBe('claude:claude-opus-5-5');
    expect(idReaderFromEnv({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-haiku-5-5', DOCUMENT_READER: ' Claude ' }).name).toBe('claude:claude-haiku-5-5');
    expect(warn).not.toHaveBeenCalled();
    // Claude without its key, or a reader that doesn't exist: the server's, and the log says so.
    expect(idReaderFromEnv({ NODE_ENV: 'production', DOCUMENT_READER: 'claude' }).name).toBe('server:ocr');
    expect(idReaderFromEnv({ NODE_ENV: 'production', DOCUMENT_READER: 'kimi' }).name).toBe('server:ocr');
    expect(warn).toHaveBeenCalledTimes(2);
    await expect(createStandInIdReader().read(input())).resolves.toEqual({ readable: true, documentType: 'drivers_license' });
  });
});
