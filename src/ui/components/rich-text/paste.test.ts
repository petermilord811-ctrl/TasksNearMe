/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { hasRichFormatting, htmlToRichText } from './paste';

describe('htmlToRichText', () => {
  it('keeps headings, lists, bold and italic', () => {
    const html = '<h2>What needs doing</h2><p>My <strong>CPU fan</strong> is <em>very</em> loud.</p><ul><li>Check the fan</li><li>Replace it</li></ul><ol><li>Back up</li><li>Test</li></ol>';
    expect(htmlToRichText(html)).toBe('## What needs doing\n\nMy **CPU fan** is *very* loud.\n\n- Check the fan\n- Replace it\n\n1. Back up\n2. Test');
  });

  it('reads Google Docs’ normal-weight wrapper as plain, and styled spans as marks', () => {
    const html = '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">Bold</span> and <span style="font-style:italic">slanted</span></p></b>';
    expect(htmlToRichText(html)).toBe('**Bold** and *slanted*');
  });

  it('drops scripts, styles and links’ addresses, and keeps words between blocks together', () => {
    const html = '<style>p{}</style><script>alert(1)</script><p>Call <a href="https://example.com">here</a></p>tail <b>end</b>';
    expect(htmlToRichText(html)).toBe('Call here\n\ntail **end**');
  });

  it('tells formatted clipboards from plain ones', () => {
    expect(hasRichFormatting('<p>plain</p>')).toBe(false);
    expect(hasRichFormatting('<li>item</li>')).toBe(true);
  });
});
