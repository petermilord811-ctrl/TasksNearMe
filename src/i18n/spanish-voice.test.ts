import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGLISH_ONLY } from '../../scripts/i18n-check.mjs';

/**
 * The Spanish copy's voice (docs/ui/spanish-glossary.md), for the rules a pattern can check: "tú", never "usted"; no
 * word that guesses the reader's gender; the glossary's words where it says "not …"; and an opening mark for every
 * question and exclamation. Staff tools stay in English (ENGLISH_ONLY). Spanish pass, 2026-11-21.
 */

const MESSAGES = fileURLToPath(new URL('../../messages/es', import.meta.url));

function flatten(value: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
  if (typeof value === 'string') out.set(prefix, value);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) flatten(inner, `${prefix}.${key}`, out);
  return out;
}

/** Every Spanish message people see, by `<file>.<key path>`. */
function spanishMessages(): Map<string, string> {
  const all = new Map<string, string>();
  for (const folder of ['ui', 'app']) {
    for (const file of fs.readdirSync(`${MESSAGES}/${folder}`).filter((name) => name.endsWith('.json'))) {
      const namespace = file.slice(0, -5);
      if (ENGLISH_ONLY.test(namespace)) continue;
      flatten(JSON.parse(fs.readFileSync(`${MESSAGES}/${folder}/${file}`, 'utf8')), `${folder}/${namespace}`, all);
    }
  }
  return all;
}

/** A whole word or phrase: `\b` sees only ASCII letters, so it would miss "expiró". */
const words = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'iu');

const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: '"tú", never "usted" ("ustedes" only for both people on a booking)', pattern: words('usted|su cuenta|ingrese|haga clic|seleccione|escriba su') },
  // Asking or telling the reader "¿Listo para…?", "Estás listo", "¡Bienvenido!": rephrase with a verb ("¿Te animas a…?",
  // "Ya puedes…", "Te damos la bienvenida"); "hasta que ambos…" (the reader and the other person) says it of the reviews instead
  // ("hasta que estén las dos"). A label about a thing agrees with the thing ("Lista para canjear": la tarjeta).
  { rule: 'no word that guesses the reader’s gender', pattern: words('¿\\s*list[oa]s? para|est[áa]s (?:ya )?(?:list|segur|nuev|interesad|preparad|conectad|suscrit|registrad|verificad)[oa]s?|¡\\s*bienvenid[oa]s?|hasta que ambos') },
  { rule: 'expired is "vencido", never "expirado" or "caducado"', pattern: words('(?:expirad|caducad)[oa]s?|expiró|caducó') },
  { rule: 'a booking is a "reserva", not a "cita" or a "contratación"', pattern: words('citas?|contrataci[óo]n') },
  { rule: 'an email is a "correo"', pattern: words('emails?') },
  { rule: 'a home address is a "domicilio"', pattern: words('direcci[óo]n de domicilio') },
  { rule: 'a time zone is the {zone} argument, never a hard-coded "hora del centro"', pattern: words('hora del centro') },
];

describe('the Spanish copy’s voice', () => {
  const messages = spanishMessages();

  it('loads the catalogs', () => {
    expect(messages.size).toBeGreaterThan(1000);
    expect(messages.get('ui/shell.postTask')).toBe('Publicar una tarea');
  });

  /** The words people read: no argument names ("{email}"), plural and select heads, or tag names. */
  // What a reader sees: first the case keys of a select or plural, which follow "select," (or "plural,") or the case
  // before them and come right before "{" ("email {correo}" is code, not the word); then placeholders; then tags.
  const prose = (text: string) =>
    text
      .replace(/(?:(?<=\b(?:select|plural|selectordinal),\s*)|(?<=\}\s*))(?:\w+|=\d+)\s*(?=\{)/gu, ' ')
      .replace(/\{\s*\w+\s*(,\s*\w+\s*)?[,}]/gu, ' ')
      .replace(/<\/?\w+>/gu, '');

  for (const { rule, pattern } of RULES) {
    it(rule, () => {
      expect([...messages].filter(([, text]) => pattern.test(prose(text))).map(([key, text]) => `${key}: ${text}`)).toEqual([]);
    });
  }

  it('names a time zone by the {zone} argument, in a sentence that reads with the name in place', () => {
    // "Los horarios están en {zone}" reads "…en hora central"; "Las horas son de {zone}" would read "horas… hora", and
    // "{market}" there is a city's time, which the zone's name replaced (completion plan 8.1).
    const clumsy = /\bhoras? (?:son de|están en) \{zone\}|\b(?:horas?|horarios?) (?:son de|están en) \{market\}/iu;
    expect([...messages].filter(([, text]) => clumsy.test(text)).map(([key, text]) => `${key}: ${text}`)).toEqual([]);
  });

  it('opens every question with ¿ and every exclamation with ¡', () => {
    // A heading split into a line and its accented end ("title" + "titleAccent") is one sentence.
    const sentence = (key: string, text: string) => (key.endsWith('Accent') ? `${messages.get(key.slice(0, -'Accent'.length)) ?? ''} ${text}` : text);
    const count = (text: string, mark: string) => text.split(mark).length - 1;
    const unopened = [...messages]
      .map(([key, text]) => [key, sentence(key, text)] as const)
      .filter(([, text]) => count(text, '?') > count(text, '¿') || count(text, '!') > count(text, '¡'))
      .map(([key, text]) => `${key}: ${text}`);
    expect(unopened).toEqual([]);
  });
});
