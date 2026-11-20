import type { z } from 'zod';

/**
 * A language model behind TasksNearMe's writing help and AI search: "Help me describe this" (`task-drafter.ts`),
 * a helper's profile (`profile-writer.ts`), an offer message (`offer-writer.ts`) and the dashboard's AI search
 * (`need-matcher.ts`). Every call asks for one structured answer that matches a zod schema, so callers get typed,
 * checked data or one of the errors below, never free text to parse.
 *
 * Kimi answers first and Claude takes over when Kimi isn't working (`fallback.ts`; the owner's choice, 2026-11-20).
 * Each provider gets the same system text and prompt, which the feature builds with only what it needs.
 */
export interface AiWriter {
  /** Who answers: `kimi:<model>`, `claude:<model>`, or a chain of them ("kimi:… then claude:…"). */
  readonly name: string;
  /** One structured answer. Resolves with data that matches `schema`, or throws one of the errors below. */
  write<T extends z.ZodType>(input: AiWriteInput<T>): Promise<z.infer<T>>;
}

export interface AiWriteInput<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
}

/** The model declined the request (its safety rules): treat it like a prohibited task. */
export class AiRefusedError extends Error {
  constructor(message = 'The model declined the request') {
    super(message);
    this.name = 'AiRefusedError';
  }
}

/** Anything else that kept a model from answering: network, key, limits, slowness, an answer that didn't fit. */
export class AiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

/** Text from people goes into prompts as plain text: no tags that could close the block it sits in. */
export function asPromptText(text: string): string {
  return text.replace(/[<>]/g, ' ').trim();
}

/** Collapses whitespace: titles, headlines and single-line answers. */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
