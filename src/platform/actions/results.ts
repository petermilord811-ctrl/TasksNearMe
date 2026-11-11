import type { z } from 'zod';
import type { ActionResult, FieldErrorCode } from '@/contracts';
import { FIELD_ERROR_CODES } from '@/contracts';

/** Helpers for Server Actions that return ActionResult (src/contracts/actions.ts). */

const KNOWN_CODES = new Set<string>(FIELD_ERROR_CODES);

/** Zod issues → `fieldErrors` codes. Contract schemas use the codes as messages. */
export function validationFailed(error: z.ZodError): ActionResult {
  const fieldErrors: Partial<Record<string, FieldErrorCode[]>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    const code = (KNOWN_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
    (fieldErrors[field] ??= []).push(code);
  }
  return { ok: false, code: 'validation_failed', fieldErrors };
}

export function fieldError(field: string, code: FieldErrorCode): ActionResult {
  return { ok: false, code: 'validation_failed', fieldErrors: { [field]: [code] } };
}

export function rateLimited(retryAt: Date): ActionResult {
  return { ok: false, code: 'rate_limited', retryAt: retryAt.toISOString() };
}
