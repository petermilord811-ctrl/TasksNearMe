import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JsonLd, serializeJsonLd } from './json-ld';

describe('serializeJsonLd', () => {
  it('escapes what could end the script or open a comment, and still parses back to the same value', () => {
    const value = { name: 'Desk </script><script>alert(1)</script> & <!-- more -->', note: 'line\u2028break\u2029para' };
    const text = serializeJsonLd(value);
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual(value);
  });
});

describe('JsonLd', () => {
  it('renders one schema.org graph in a data script', () => {
    const html = renderToStaticMarkup(<JsonLd nodes={[{ '@type': 'BreadcrumbList', itemListElement: [] }, { '@type': 'WebSite', name: 'TasksNearMe' }]} />);
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    const json = JSON.parse(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    expect(json).toEqual({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'BreadcrumbList', itemListElement: [] }, { '@type': 'WebSite', name: 'TasksNearMe' }],
    });
  });

  it('renders nothing for no nodes', () => {
    expect(renderToStaticMarkup(<JsonLd nodes={[]} />)).toBe('');
  });
});
