import { describe, expect, it } from 'vitest';
import { parseRichInline, parseRichText, richTextSummary, richTextToPlain, tidyRichText } from './rich-text';

describe('parseRichInline', () => {
  it('reads bold, italic and both, nested as written', () => {
    expect(parseRichInline('a **bold** and *italic* and ***both***')).toEqual([
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italic: true },
      { text: ' and ' },
      { text: 'both', bold: true, italic: true },
    ]);
    expect(parseRichInline('**very *nice* work**')).toEqual([
      { text: 'very ', bold: true },
      { text: 'nice', bold: true, italic: true },
      { text: ' work', bold: true },
    ]);
    expect(parseRichInline('__bold__ _italic_')).toEqual([{ text: 'bold', bold: true }, { text: ' ' }, { text: 'italic', italic: true }]);
  });

  it('leaves stray markers, maths and snake_case as typed', () => {
    for (const text of ['2*3*4 = 24', 'my_file_name', 'a * b', '** text**', 'price: 5*', 'one *unclosed', '_ spaced _']) {
      expect(parseRichInline(text)).toEqual([{ text }]);
    }
  });

  it('never marks across a line break', () => {
    expect(parseRichInline('*one\ntwo*')).toEqual([{ text: '*one\ntwo*' }]);
  });
});

describe('parseRichText', () => {
  it('keeps a plain description as paragraphs with its line breaks', () => {
    expect(parseRichText('Assemble a desk.\nIt is in the box.\n\nI have tools.')).toEqual([
      { type: 'paragraph', lines: [[{ text: 'Assemble a desk.' }], [{ text: 'It is in the box.' }]] },
      { type: 'paragraph', lines: [[{ text: 'I have tools.' }]] },
    ]);
  });

  it('reads headings and both kinds of list', () => {
    const blocks = parseRichText('I need help with my desk.\n\n## What needs doing\n- Unpack the boxes\n* Assemble the **desk**\n\n### Steps\n3. First\n4) Second\n');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[{ text: 'I need help with my desk.' }]] },
      { type: 'heading', content: [{ text: 'What needs doing' }] },
      { type: 'list', ordered: false, items: [[{ text: 'Unpack the boxes' }], [{ text: 'Assemble the ' }, { text: 'desk', bold: true }]] },
      { type: 'heading', content: [{ text: 'Steps' }] },
      { type: 'list', ordered: true, start: 3, items: [[{ text: 'First' }], [{ text: 'Second' }]] },
    ]);
  });

  it('carries a list across blank lines and indented continuation lines', () => {
    expect(parseRichText('- one\n\n- two\n  continued\nAfter')).toEqual([
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two continued' }]] },
      { type: 'paragraph', lines: [[{ text: 'After' }]] },
    ]);
  });

  it('starts a new list when the kind changes, and drops empty bullets', () => {
    expect(parseRichText('- a\n1. b\n- \n')).toEqual([
      { type: 'list', ordered: false, items: [[{ text: 'a' }]] },
      { type: 'list', ordered: true, items: [[{ text: 'b' }]] },
    ]);
  });

  it('reads "#tag", "##" alone and "---" as text', () => {
    expect(parseRichText('#tag\n##\n---')).toEqual([{ type: 'paragraph', lines: [[{ text: '#tag' }], [{ text: '##' }], [{ text: '---' }]] }]);
  });
});

describe('richTextToPlain and richTextSummary', () => {
  const formatted = 'My **CPU fan** is loud.\n\n## What needs doing\n- Check the fan\n- Replace it if needed\n\n1. Back up\n2. Test';

  it('drops the marks and keeps the shape', () => {
    expect(richTextToPlain(formatted)).toBe('My CPU fan is loud.\n\nWhat needs doing\n\n• Check the fan\n• Replace it if needed\n\n1. Back up\n2. Test');
  });

  it('summarizes on one line, cut at a word', () => {
    expect(richTextSummary(formatted)).toBe('My CPU fan is loud. What needs doing • Check the fan • Replace it if needed 1. Back up 2. Test');
    expect(richTextSummary(formatted, 40)).toBe('My CPU fan is loud. What needs doing •…');
  });
});

describe('tidyRichText', () => {
  it('turns HTML into the format and strips what it can’t show', () => {
    expect(tidyRichText('<p>My <b>fan</b> is <em>loud</em>.</p><h2>What needs doing</h2><ul><li>Check it</li><li>Fix it</li></ul><script>x</script>')).toBe(
      'My **fan** is *loud*.\n\n## What needs doing\n\n- Check it\n- Fix it',
    );
  });

  it('normalizes headings, bullets, links, code and blank lines', () => {
    expect(tidyRichText('# Title\n\n\n\n* one\n• two\n\nSee [the site](https://example.com) and `code`.\n```\nblock\n```\n![img](x.png)')).toBe(
      '## Title\n\n- one\n- two\n\nSee the site and code.\nblock',
    );
  });

  it('decodes entities once', () => {
    expect(tidyRichText('Tom &amp; Jerry &amp;lt;3')).toBe('Tom & Jerry &lt;3');
  });
});
