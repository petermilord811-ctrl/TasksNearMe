/**
 * The market the home page shows. Configurable so another city can launch without code changes. Its own module (no
 * database) so the admin Markets section can name it too: pausing it takes the home page down (launch rehearsal J-L1).
 */
export const DEFAULT_MARKET_SLUG = process.env.DEFAULT_MARKET_SLUG ?? 'gainesville';
