import type { AppLocale } from '@/contracts';

/**
 * Which of the app's two languages a message is written in, by a cheap guess (2026-11-24, "Translate this conversation"):
 * common short words of each language, and Spanish's own letters and marks. It only spares a model call for what the
 * reader can already read: a message it can't tell (`unknown`: too short, or another language) is translated, and one
 * with no words at all (`none`: an emoji, a number) has nothing to translate.
 */
export type LanguageGuess = AppLocale | 'unknown' | 'none';

// Words only one of the two languages uses ("a", "no", "me", "he", "son", "con", "come" are in both, so in neither).
const ENGLISH = new Set(
  `the and you your yours is are was were be been being to of in it its it's that this these those for with on at have has had
  will would can can't could should i i'm i'll i've i'd we we're they they're them their there here what when where which who how
  why do does did don't didn't not just but or if so from about out up get got thanks thank please yes yeah hi hello hey sure great
  good sounds see tomorrow today tonight morning afternoon evening time any some all let know need help work our us an by as am my
  after before then than also too only still back come coming going ready done fine nice anything something everything`
    .split(/\s+/)
    .filter(Boolean),
);
const SPANISH = new Set(
  `el la los las un una unos unas que qué de del al y en es está están estoy estás estamos por para sin pero como cómo muy más
  también sí gracias hola buenos buenas días tarde noche mañana hoy ayer puedo puedes puede podemos quiero quieres necesito
  necesitas tengo tienes tiene hay eso esto esta este ese esa aquí allí ahí cuando cuándo donde dónde porque ya bien nos te le
  les lo mi mis tu tus su sus yo tú usted ustedes ellos ella él se sábado domingo lunes martes miércoles jueves viernes casa ayuda
  trabajo hora horas claro vale listo nada algo todo todos cuál quién desde hasta entre después antes ahora luego entonces pues
  bueno favor llego llegar venir voy vas va vamos hacer hago dime mucho mucha poco`
    .split(/\s+/)
    .filter(Boolean),
);
const SPANISH_MARKS = /[ñáéíóúü¿¡]/giu;

export function guessLanguage(text: string): LanguageGuess {
  const words = text.toLowerCase().replace(/’/g, "'").match(/\p{L}[\p{L}']*/gu) ?? [];
  if (words.length === 0) return 'none';
  let english = 0;
  let spanish = 0;
  for (const word of words) {
    if (ENGLISH.has(word)) english += 1;
    if (SPANISH.has(word)) spanish += 1;
  }
  // Spanish letters and marks count too, a few at most (a name like "José" in an English message shouldn't decide it).
  spanish += Math.min(3, (text.match(SPANISH_MARKS) ?? []).length);
  if (english === spanish) return 'unknown';
  return english > spanish ? 'en' : 'es';
}

/** Whether a message needs translating for a reader of `to`: not one already in their language, nor one with no words. */
export function needsTranslation(text: string, to: AppLocale): boolean {
  const guess = guessLanguage(text);
  return guess !== 'none' && guess !== to;
}
