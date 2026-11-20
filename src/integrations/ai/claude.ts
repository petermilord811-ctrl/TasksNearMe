import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { AiRefusedError, AiUnavailableError, type AiWriteInput, type AiWriter } from './writer';

/**
 * Claude, through the official Anthropic SDK: it takes over the writing help and AI search when Kimi isn't working
 * (`fallback.ts`), and it alone reads ID and address documents (`id-document-reader.ts`, `document-reader.ts`).
 *
 * The model is Claude Opus 5.5 at low effort (quick answers for a button in a form); `ANTHROPIC_MODEL`
 * overrides it, e.g. `claude-haiku-5-5` for lower cost. The key is `ANTHROPIC_API_KEY` (server only).
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/** What the writer needs from the SDK client (tests pass a stub). */
export type ClaudeClient = Pick<Anthropic, 'messages'>;

export function createClaudeWriter({ client, model }: { client: ClaudeClient; model: string }): AiWriter {
  return {
    name: `claude:${model}`,
    async write<T extends z.ZodType>({ system, prompt, schema, maxTokens = 4_000 }: AiWriteInput<T>): Promise<z.infer<T>> {
      let response;
      try {
        response = await client.messages.parse({
          model,
          // Thinking is always on for this model; low effort keeps it short.
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
          output_config: { effort: 'low', format: zodOutputFormat(schema) },
        });
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? ` (HTTP ${error.status ?? 'none'})` : '';
        throw new AiUnavailableError(`Claude didn't answer${status}`, { cause: error });
      }
      if (response.stop_reason === 'refusal') throw new AiRefusedError('Claude declined the request');
      if (response.stop_reason === 'max_tokens') throw new AiUnavailableError('Claude ran out of room for the answer');
      if (response.parsed_output === null || response.parsed_output === undefined) throw new AiUnavailableError("Claude's answer didn't fit the expected shape");
      return response.parsed_output as z.infer<T>;
    },
  };
}

/** Claude for this environment, or null without a key. One client per process. */
let cached: { key: string; model: string; writer: AiWriter } | undefined;
export function claudeWriterFromEnv(env: Record<string, string | undefined> = process.env): AiWriter | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  if (cached?.key !== key || cached.model !== model) {
    // A button in a form: fail fast rather than keep someone waiting.
    const client = new Anthropic({ apiKey: key, timeout: 30_000, maxRetries: 1 });
    cached = { key, model, writer: createClaudeWriter({ client, model }) };
  }
  return cached.writer;
}
