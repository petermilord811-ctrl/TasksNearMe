/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RichText } from './rich-text';

afterEach(cleanup);

describe('RichText', () => {
  it('draws headings at the level given, lists with their numbers, bold and italic', () => {
    const { container } = render(<RichText headingLevel={4} text={'I need help.\n\n## What needs doing\n- Unpack the **box**\n- Build it\n\n3. Third\n4. *Fourth*'} />);
    expect(screen.getByRole('heading', { level: 4, name: 'What needs doing' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Unpack the box', 'Build it', 'Third', 'Fourth']);
    expect(container.querySelector('ol')).toHaveAttribute('start', '3');
    expect(container.querySelector('strong')).toHaveTextContent('box');
    expect(container.querySelector('em')).toHaveTextContent('Fourth');
  });

  it('keeps a plain description’s line breaks', () => {
    const { container } = render(<RichText text={'Line one\nLine two'} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('never turns typed HTML into elements', () => {
    const { container } = render(<RichText text={'<script>alert(1)</script> <img src=x onerror=alert(1)> <a href="https://example.com">link</a>'} />);
    expect(container.querySelector('script, img, a')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script> <img src=x onerror=alert(1)> <a href="https://example.com">link</a>');
  });
});
