/**
 * Who reads ID photos and proofs of address (owner, 2026-11-21: "for ID check: our own server", and no paid AI
 * plans). The server's own readers (`src/integrations/ocr`) by default, in every environment, production
 * included: they need no key and nothing leaves the server. `DOCUMENT_READER=claude` with `ANTHROPIC_API_KEY`
 * switches back to Claude. An empty or unset value means the server; Claude without a key, or a value that
 * names no reader, says so once in the log and stays on the server's readers.
 */
export type DocumentReaderChoice = 'server' | 'claude';

const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[document-reader] ${message}`);
}

export function documentReaderChoice(env: Record<string, string | undefined> = process.env): DocumentReaderChoice {
  const wanted = env.DOCUMENT_READER?.trim().toLowerCase() ?? '';
  if (wanted === '' || wanted === 'server') return 'server';
  if (wanted === 'claude') {
    if (env.ANTHROPIC_API_KEY?.trim()) return 'claude';
    warnOnce('DOCUMENT_READER=claude needs ANTHROPIC_API_KEY: documents are read on this server instead.');
    return 'server';
  }
  warnOnce(`DOCUMENT_READER=${wanted.slice(0, 20)} isn't a reader (server or claude): documents are read on this server.`);
  return 'server';
}
