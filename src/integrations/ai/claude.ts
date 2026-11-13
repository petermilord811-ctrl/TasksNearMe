import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

/**
 * Claude for TasksNearMe's writing help ("Help me describe this", a helper's profile, an offer message),
 * through the official Anthropic SDK. Every call asks for one structured answer that matches a zod schema,
 * so callers get typed, checked data or an error, never free text to parse.
 *
 * The model is Claude Opus 5.5 at low effort (quick answers for a button in a form); `ANTHROPIC_MODEL`
 * overrides it, e.g. `claude-haiku-5-5` for lower cost. The key is `ANTHROPIC_API_KEY` (server only).
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/** Claude declined the request (its safety rules): treat it like a prohibited task. */
export class AiRefusedError extends Error {
  constructor(message = 'Claude declined the request') {
    super(message);
    this.name = 'AiRefusedError';
  }
}

/** Anything else that kept Claude from answering: network, key, limits, an answer that didn't fit. */
export class AiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

export interface ClaudeWriter {
  readonly model: string;
  /** One structured answer. Resolves with data that matches `schema`, or throws one of the errors above. */
  write<T extends z.ZodType>(input: { system: string; prompt: string; schema: T; maxTokens?: number }): Promise<z.infer<T>>;
}

/** Text from people goes into prompts as plain text: no tags that could close the block it sits in. */
export function asPromptText(text: string): string {
  return text.replace(/[<>]/g, ' ').trim();
}

/** Collapses whitespace: titles, headlines and single-line answers. */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** What the writer needs from the SDK client (tests pass a stub). */
export type ClaudeClient = Pick<Anthropic, 'messages'>;

export function createClaudeWriter({ client, model }: { client: ClaudeClient; model: string }): ClaudeWriter {
  return {
    model,
    async write<T extends z.ZodType>({ system, prompt, schema, maxTokens = 4_000 }: { system: string; prompt: string; schema: T; maxTokens?: number }): Promise<z.infer<T>> {
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
      if (response.stop_reason === 'refusal') throw new AiRefusedError();
      if (response.stop_reason === 'max_tokens') throw new AiUnavailableError('Claude ran out of room for the answer');
      if (response.parsed_output === null || response.parsed_output === undefined) throw new AiUnavailableError("Claude's answer didn't fit the expected shape");
      return response.parsed_output as z.infer<T>;
    },
  };
}

/** Claude for this environment, or null without a key. One client per process. */
let cached: { key: string; model: string; writer: ClaudeWriter } | undefined;
export function claudeWriterFromEnv(env: Record<string, string | undefined> = process.env): ClaudeWriter | null {
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
