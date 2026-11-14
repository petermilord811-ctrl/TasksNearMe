import type { JsonLdNode } from './structured-data';

/**
 * JSON as it can sit inside a <script> element. Task titles and helper headlines are people's own text, so every
 * `<`, `>` and `&` is escaped: no value can close the script or open a comment. Line and paragraph separators too,
 * for older parsers that read them as line breaks.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A page's structured data for search engines (src/modules/seo/structured-data.ts), as one schema.org graph. */
export function JsonLd({ nodes }: { nodes: readonly JsonLdNode[] }) {
  if (nodes.length === 0) return null;
  const graph = { '@context': 'https://schema.org', '@graph': nodes };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }} />;
}
