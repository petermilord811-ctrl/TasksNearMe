import { z } from 'zod';
import { normalizeUsPhone } from '@/shared/phone';
import type { FieldErrorCode } from './actions';

/**
 * Reusable form fields. Every message is a `FieldErrorCode`, so a form shows
 * `t(\`forms.fieldErrors.${error.message}\`)` whether the error came from the client
 * (react-hook-form + zodResolver with these schemas) or from the server (`ActionResult.fieldErrors`).
 * The server validates again with the same schemas.
 */

const code = (value: FieldErrorCode) => value;

/** Trimmed and lower-cased. */
export const emailField = z
  .string(code('required'))
  .trim()
  .toLowerCase()
  .min(1, code('required'))
  .max(254, code('too_long'))
  .pipe(z.email(code('invalid')));

/** The 6-digit code we email or text. */
export const oneTimeCodeField = z
  .string(code('required'))
  .trim()
  .min(1, code('required'))
  .regex(/^\d{6}$/, code('invalid'));

/** A US number in any common format; the app stores it as E.164. Other countries: `not_supported`. */
export const usPhoneField = z
  .string(code('required'))
  .trim()
  .min(1, code('required'))
  .superRefine((value, ctx) => {
    if (normalizeUsPhone(value)) return;
    ctx.addIssue({ code: 'custom', message: /^\+(?!1)/.test(value) ? code('not_supported') : code('invalid') });
  });

export const zipField = z
  .string(code('required'))
  .trim()
  .min(1, code('required'))
  .regex(/^\d{5}$/, code('invalid'));

export const personNameField = (max: number) =>
  z.string(code('required')).trim().min(1, code('required')).max(max, code('too_long'));

/** A checkbox that must be ticked. */
export const mustAcceptField = z.boolean(code('must_accept')).refine((value) => value, code('must_accept'));
