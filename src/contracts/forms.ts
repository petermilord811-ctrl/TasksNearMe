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
/**
 * A device's key for one intent (a post, a message; bad connections pass, J-N1): a UUID made on the phone and sent again
 * with a repeat after an answer that never arrived, so the server returns the first result instead of doing it twice.
 */
export const requestKeyField = z.uuid('invalid');

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

/**
 * What's wrong with a person's name, if anything (abuse rehearsal J-AB3). Other people see it before any booking, on
 * offers, conversations and reviews, where contact details are hidden, so a name can't carry a phone number, an email or
 * a link (`contact_details`). It can't pass for our team either (`name_reserved`): "TasksNearMe", "Support", "Admin",
 * "Staff", "Moderator", "Official", "Team", "Deleted", and their Spanish. Read in NFKC form, as masking reads text
 * (full-width digits are digits).
 */
const NAME_CONTACT = /\p{Nd}|@|:\/\/|(?<!\p{L})www\.|\.(?:com|net|org|io|co|me|app)(?!\p{L})/iu;
const NAME_RESERVED = /(?<!\p{L})(?:tasks\s*near\s*me|support|soporte|admin|administrador|administradora|administrator|staff|moderator|moderador|moderadora|official|oficial|team|equipo|helpdesk|deleted|eliminad[ao])(?!\p{L})/iu;
export function nameProblem(value: string): 'contact_details' | 'name_reserved' | null {
  const folded = value.normalize('NFKC');
  if (NAME_CONTACT.test(folded)) return 'contact_details';
  if (NAME_RESERVED.test(folded)) return 'name_reserved';
  return null;
}

export const personNameField = (max: number) =>
  z
    .string(code('required'))
    .trim()
    .min(1, code('required'))
    .max(max, code('too_long'))
    .superRefine((value, ctx) => {
      const problem = nameProblem(value);
      if (problem) ctx.addIssue({ code: 'custom', message: code(problem) });
    });

/** A checkbox that must be ticked. */
export const mustAcceptField = z.boolean(code('must_accept')).refine((value) => value, code('must_accept'));
