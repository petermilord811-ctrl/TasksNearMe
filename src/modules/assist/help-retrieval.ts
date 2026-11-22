/**
 * Which help articles a question to the support assistant is about (2026-11-22): a small keyword search over the help
 * center, so the prompt carries the few articles that matter instead of all of them (free models answer faster with a
 * short prompt, and stay closer to it). Pure: the articles come in as text (`listHelpArticleTexts`).
 *
 * Words are compared without case or accents, common words left out, and English endings trimmed ("charged",
 * "charges" and "charge" match). A word in an article's title counts eight times, in its summary twice, in its text
 * once; a few everyday words also look for the words the articles use ("refund" finds "cancel" and "charged"), at half
 * the weight of the question's own words, and a word few articles use counts more than one most of them do.
 */

export interface RetrievableArticle {
  slug: string;
  title: string;
  summary: string;
  text: string;
}

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can could did do does for from get got had has have how i if in into is it its me my no not of on or our so ' +
    'that the their them then there they this to too us was we were what when where which who why will with would you your ' +
    'about am any been being just more much need should some than want also there here off out up down very ' +
    // Spanish
    'a al como con cual cuando de del donde el ella en es esta este hay la las le lo los me mi mis no o para pero por que qué se si sin ' +
    'su sus te tu un una uno y ya yo puedo quiero tengo hacer'
  ).split(' '),
);

/** Everyday words and the words the help center uses for the same thing. */
const ALSO: Record<string, string[]> = {
  refund: ['refund', 'cancel', 'charg'],
  money: ['pay', 'paid', 'charg'],
  payout: ['paid', 'payout', 'earn'],
  bank: ['paid', 'payout'],
  fee: ['fee', 'pay', 'price', 'charg'],
  cost: ['price', 'pay', 'fee'],
  price: ['price', 'pay'],
  charg: ['charg', 'pay'],
  bill: ['charg', 'pay'],
  cancel: ['cancel', 'refund', 'reembols'],
  verif: ['verifi', 'verified', 'id'],
  id: ['verifi', 'id'],
  background: ['background', 'check', 'verifi'],
  address: ['address'],
  safe: ['safe', 'safety'],
  danger: ['safe', 'safety', 'emergency'],
  scam: ['safe', 'report'],
  problem: ['problem', 'report'],
  report: ['report', 'problem'],
  dispute: ['problem', 'report'],
  helper: ['helper'],
  earn: ['earn', 'paid'],
  post: ['post', 'task'],
  move: ['mov'],
  // Spanish
  reembolso: ['reembols', 'cancel', 'cobr'],
  cobr: ['cobr', 'pag'],
  pag: ['pag', 'cobr'],
  dinero: ['pag', 'cobr'],
  direccion: ['direccion'],
  segur: ['segur'],
  problema: ['problema', 'report'],
  verific: ['verific'],
};

/** Lower case, no accents, letters and digits only. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** A word's stem: English endings off (for words long enough to have one). */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** The words of a text worth matching, as stems. */
export function keywords(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}

/** The stems a question looks for, each with its weight: its own words count twice, the help center's words for them once. */
function queryTerms(question: string): Map<string, number> {
  const terms = new Map<string, number>();
  for (const word of keywords(question)) {
    terms.set(word, 2);
    for (const [key, extra] of Object.entries(ALSO)) if (word.startsWith(key)) for (const term of extra) if (!terms.has(term)) terms.set(term, 1);
  }
  return terms;
}

/** A term found in a field's words: the same stem, or a word that starts with it (4 letters or more). */
function found(term: string, words: Set<string>): boolean {
  if (words.has(term)) return true;
  if (term.length < 4) return false;
  for (const word of words) if (word.startsWith(term)) return true;
  return false;
}

/** How well each article matches the question, best first; articles that don't match at all are left out. */
export function rankHelpArticles<T extends RetrievableArticle>(question: string, articles: readonly T[]): { article: T; score: number }[] {
  const terms = queryTerms(question);
  if (terms.size === 0) return [];
  const fields = articles.map((article) => ({ article, title: new Set(keywords(article.title)), summary: new Set(keywords(article.summary)), text: new Set(keywords(article.text)) }));
  // A word most articles use ("helper", "task") tells less about which one a question means than a rare one ("paid").
  const rarity = new Map<string, number>();
  for (const term of terms.keys()) {
    const using = fields.filter((field) => found(term, field.title) || found(term, field.summary) || found(term, field.text)).length;
    rarity.set(term, Math.log(1 + fields.length / (1 + using)));
  }
  return fields
    .map(({ article, title, summary, text }) => {
      let score = 0;
      for (const [term, weight] of terms) score += weight * rarity.get(term)! * ((found(term, title) ? 8 : 0) + (found(term, summary) ? 2 : 0) + (found(term, text) ? 1 : 0));
      return { article, score: Math.round(score * 100) / 100 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.article.slug.localeCompare(b.article.slug));
}

/** The articles to give the assistant for a question (and the earlier ones in the chat): the best few. */
export function pickHelpArticles<T extends RetrievableArticle>(question: string, earlier: readonly string[], articles: readonly T[], count = 3): T[] {
  const ranked = rankHelpArticles(question, articles);
  // A follow-up ("and if they don't show?") leans on what came before.
  const context = ranked.length > 0 ? [] : rankHelpArticles(earlier.slice(-2).join(' '), articles);
  return [...ranked, ...context].map((entry) => entry.article).filter((article, index, all) => all.indexOf(article) === index).slice(0, count);
}
