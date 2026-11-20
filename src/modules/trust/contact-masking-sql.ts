import { MASK } from './contact-masking';

/**
 * contact-masking.ts's patterns in Postgres's regular expressions (AREs: `\y` is a word boundary, JavaScript's `\b`),
 * applied in the same order, for text masked inside the database. `tasks.search_text` is generated from it (migration
 * 0066, redefined in 0068), so task search matches only what a reader can see: never a phone, an email or a link that
 * the pages show as [hidden] (aa's sweep P4, 2026-11-18: "q=gmail" listed tasks by a hidden address).
 *
 * The generated column keeps the SQL it was created with. A change to these patterns needs a migration that redefines
 * the column; tests/integration/task-search-masking.test.ts checks that the database and maskContactDetails agree.
 */
export const CONTACT_PATTERNS_SQL: readonly string[] = [
  // Emails, including "name at domain dot com", "name (at) domain (dot) com" and "name at domain.com".
  String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+`,
  String.raw`\y[\w.+-]+\s*(?:\(|\[)?\s*at\s*(?:\)|\])?\s*[\w-]+(?:\s*(?:\(|\[)?\s*dot\s*(?:\)|\])?\s*|\.)(?:com|net|org|edu|io|co)\y`,
  // Links.
  String.raw`\yhttps?://\S+`,
  String.raw`\ywww\.\S+`,
  String.raw`\y[\w-]+\.(?:com|net|org|io|co|me|app)(?:/\S*)?\y`,
  // Phone numbers: E.164, and US numbers with common separators and an optional +1 or 1, bounded by other digits.
  String.raw`\+[1-9]\d{7,14}(?!\d)`,
  String.raw`(?<!\d)(?:\+?1[\s./-]*)?\(?\d{3}\)?[\s./-]*\d{3}[\s./-]*\d{2}[\s./-]?\d{2}(?!\d)`,
];

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * A SQL expression for `expression` in NFKC form with its contact details replaced by MASK, as maskContactDetails does
 * (which keeps the characters around them as written: the two agree on the NFKC form of its result).
 */
export function maskContactDetailsSql(expression: string): string {
  return CONTACT_PATTERNS_SQL.reduce((inner, pattern) => `regexp_replace(${inner}, ${literal(pattern)}, ${literal(MASK)}, 'gi')`, `normalize(${expression}, NFKC)`);
}
