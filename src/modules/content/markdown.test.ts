import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, parseSections, slugify, splitFrontMatter } from './markdown';

describe('front matter', () => {
  it('reads key: value lines and returns the body', () => {
    const { meta, body } = splitFrontMatter('---\ntitle: When am I charged?\nupdated: 2026-11-11\n---\nHello.\n');
    expect(meta).toEqual({ title: 'When am I charged?', updated: '2026-11-11' });
    expect(body).toBe('Hello.\n');
  });

  it('handles CRLF and missing front matter', () => {
    expect(splitFrontMatter('---\r\na: 1\r\n---\r\nx').meta).toEqual({ a: '1' });
    expect(splitFrontMatter('just text')).toEqual({ meta: {}, body: 'just text' });
  });
});

describe('inline', () => {
  it('parses bold and links, keeps everything else as text', () => {
    expect(parseInline('Pay **after** the task. See [pricing](/pricing) or [Stripe](https://stripe.com).')).toEqual([
      'Pay ',
      { text: 'after', strong: true },
      ' the task. See ',
      { text: 'pricing', href: '/pricing' },
      ' or ',
      { text: 'Stripe', href: 'https://stripe.com' },
      '.',
    ]);
  });

  it('never turns HTML into markup', () => {
    expect(parseInline('<b>hi</b> <script>x</script>')).toEqual(['<b>hi</b> <script>x</script>']);
  });
});

describe('blocks', () => {
  it('parses paragraphs, headings, lists, and callouts', () => {
    const blocks = parseBlocks(
      [
        'First line',
        'continues here.',
        '',
        '## What you pay {#what}',
        '- The task price.',
        '- A **service fee**.',
        '',
        '1. Done',
        '2. Approved',
        '',
        '> [!warning] Never pay in cash.',
        '> It is not covered.',
        '> [!info] See [pricing](/pricing).',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { type: 'paragraph', content: ['First line continues here.'] },
      { type: 'heading', text: 'What you pay' },
      { type: 'list', ordered: false, items: [['The task price.'], ['A ', { text: 'service fee', strong: true }, '.']] },
      { type: 'list', ordered: true, items: [['Done'], ['Approved']] },
      { type: 'callout', tone: 'warning', content: ['Never pay in cash. It is not covered.'] },
      { type: 'callout', tone: 'info', content: ['See ', { text: 'pricing', href: '/pricing' }, '.'] },
    ]);
  });
});

describe('legal sections', () => {
  it('splits on ## headings with explicit or generated ids', () => {
    const { intro, sections } = parseSections(
      'Intro text.\n\n## 1. Who we are {#who-we-are}\nWe connect people.\n\n### Contact\nWrite to us.\n\n## 2. Your account\n- 18+\n',
    );
    expect(intro).toEqual([{ type: 'paragraph', content: ['Intro text.'] }]);
    expect(sections.map((s) => [s.id, s.title])).toEqual([
      ['who-we-are', '1. Who we are'],
      ['your-account', '2. Your account'],
    ]);
    expect(sections[0]!.blocks).toEqual([
      { type: 'paragraph', content: ['We connect people.'] },
      { type: 'heading', text: 'Contact' },
      { type: 'paragraph', content: ['Write to us.'] },
    ]);
  });

  it('rejects duplicate section ids', () => {
    expect(() => parseSections('## A {#x}\n## B {#x}\n')).toThrow(/Duplicate/);
  });

  it('slugifies titles without their numbering', () => {
    expect(slugify('3. Payments & refunds')).toBe('payments-refunds');
  });
});
