import type { z } from 'zod';
import { MASK, maskContactDetails } from '@/modules/trust/contact-masking';

/**
 * A language model behind TasksNearMe's writing help and AI search: "Help me describe this" (`task-drafter.ts`),
 * a helper's profile (`profile-writer.ts`), an offer message (`offer-writer.ts`) and the dashboard's AI search
 * (`need-matcher.ts`). Every call asks for one structured answer that matches a zod schema, so callers get typed,
 * checked data or one of the errors below, never free text to parse.
 *
 * Free models answer, through a load balancer that spreads requests over their free allowances: Gemini first, then
 * Kimi, then Groq, with no paid plan (`balancer.ts`; the owner's choice, 2026-11-21). Each model gets the same system
 * text and prompt, which the feature builds with only what it needs.
 */
export interface AiWriter {
  /** Who answers: `gemini:<model>`, `kimi:<model>`, `groq:<model>`, or the balancer over them ("gemini:… then groq:…"). */
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

/**
 * The model is at its free allowance (HTTP 429): it works, but answers again only after `retryAfterMs`. The balancer
 * skips it until then instead of counting a failure. Callers that only know `AiUnavailableError` treat it as one.
 */
export class AiRateLimitedError extends AiUnavailableError {
  constructor(
    message: string,
    /** How long until it answers again, when the provider said; the balancer assumes a minute otherwise. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiRateLimitedError';
  }
}

/**
 * Text from people goes into prompts private and plain. Phone numbers, emails and links are masked
 * (`maskContactDetails`, as on public pages), and so are street addresses, before any model sees them: no feature needs
 * them, and the free models' terms let their providers keep or review what they're sent (Gemini's unpaid tier, NVIDIA's
 * trial). There are no tags that could close the block the text sits in, either. Every prompt builder passes people's
 * text through here, whatever the model.
 */
export function asPromptText(text: string): string {
  return maskStreetAddresses(maskContactDetails(text).text).replace(/[<>]/g, ' ').trim();
}

/**
 * A US street address: a house number, up to three name words and a street type, then an optional unit ("1234 NW 13th
 * St, Apt 5", "88 Main Street #2B", "742 Evergreen Terrace"). Best-effort and for prompts only: a cross street without
 * a number ("2nd Ave") stays, and a rare phrase that reads like an address ("12 chairs way over") is masked too.
 */
const STREET_ADDRESS = new RegExp(
  String.raw`(?<![\w$])\d{1,6}[a-z]?\s+(?:(?:n|s|e|w|ne|nw|se|sw)\.?\s+)?(?:[a-z0-9][\w'.-]*\s+){0,3}?` +
    String.raw`(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|parkway|pkwy|highway|hwy|terrace|ter|circle|cir|place|pl|way|trail|trl)\b\.?` +
    String.raw`(?:\s+(?:n|s|e|w|ne|nw|se|sw)\b\.?)?(?:,?\s*(?:apt|apartment|unit|suite|ste|#)\.?\s*#?[\w-]+)?`,
  'gi',
);

export function maskStreetAddresses(text: string): string {
  return text.replace(STREET_ADDRESS, MASK);
}

/** Collapses whitespace: titles, headlines and single-line answers. */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A comma-separated setting ("a, b"), each item once, or `fallback` when it's empty. */
export function envList(value: string | undefined, fallback: readonly string[]): string[] {
  const items = [...new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
  return items.length > 0 ? items : [...fallback];
}

/** A setting in seconds, in milliseconds; `fallbackMs` when it's empty, zero or not a number. */
export function envMilliseconds(value: string | undefined, fallbackMs: number): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}
