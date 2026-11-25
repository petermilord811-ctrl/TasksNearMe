import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { AiAssistResult, FieldErrorCode } from '@/contracts';
import { FIELD_ERROR_CODES } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit, type RateLimitRule } from '@/platform/rate-limit';

/**
 * The common path of the AI features (2026-11-24, src/contracts/ai-assist.ts): the limit, the call, and what a failure
 * reads as. A refusal is `prohibited` on the field the words came from; anything else that kept a model from answering
 * is `unavailable` (logged when it wasn't one of the AI errors, never with the person's words).
 */

export type AiAssistFailure = Extract<AiAssistResult<never>, { ok: false }>;

export const UNAVAILABLE: AiAssistFailure = { ok: false, code: 'unavailable' };
export const NOT_FOUND: AiAssistFailure = { ok: false, code: 'not_found' };

export function prohibitedOn(field: string): AiAssistFailure {
  return { ok: false, code: 'validation_failed', fieldErrors: { [field]: ['prohibited'] } };
}

const KNOWN_CODES = new Set<string>(FIELD_ERROR_CODES);

/** Zod issues as `fieldErrors` (contract schemas use the codes as messages). */
export function invalidInput(error: z.ZodError): AiAssistFailure {
  const fieldErrors: Partial<Record<string, FieldErrorCode[]>> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : 'form';
    (fieldErrors[field] ??= []).push((KNOWN_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode);
  }
  return { ok: false, code: 'validation_failed', fieldErrors };
}

/** Counts one request toward the person's limit for this feature; the refusal when they're over it. */
export async function overLimit(db: Db, key: string, rule: RateLimitRule, now: Date): Promise<AiAssistFailure | null> {
  const limited = await consumeRateLimit(db, key, rule, now);
  return limited.ok ? null : { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
}

/** Runs the model's part: the value on success, what a failure reads as otherwise. */
export async function asAiResult<T>(label: string, field: string, call: () => Promise<T>): Promise<AiAssistResult<T>> {
  try {
    return { ok: true, code: 'drafted', value: await call() };
  } catch (error) {
    if (error instanceof AiRefusedError) return prohibitedOn(field);
    if (!(error instanceof AiUnavailableError)) console.error(`[${label}]`, error instanceof Error ? error.message : 'failed');
    return UNAVAILABLE;
  }
}

/** A short, stable hash of what a stored result was made from (src/modules/assist/schema.ts, `input_hash`). */
export function inputHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 32);
}
