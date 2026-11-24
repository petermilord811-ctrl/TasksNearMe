/** @vitest-environment jsdom */
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ContentBlock } from '@/contracts';
import { helpArticleWhenCharged } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import help from '../../../../messages/en/ui/help.json';
import { ContentBlocks } from './content-blocks';

vi.mock('next/link', () => ({ default: ({ href, ...props }: ComponentProps<'a'>) => <a {...props} href={href} data-next-link="true" /> }));
afterEach(cleanup);

function renderBlocks(blocks: ContentBlock[], headingLevel?: 2 | 3) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, help }}><ContentBlocks blocks={blocks} headingLevel={headingLevel} /></NextIntlClientProvider>);
}

describe('ContentBlocks', () => {
  it('renders the typed content, emphasis, list kinds, and both callout tones', () => {
    const { container } = renderBlocks(helpArticleWhenCharged.blocks);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelector('strong')?.textContent).toBe('after the task is done');
    expect(screen.getByRole('heading', { level: 2, name: 'What you pay' })).toBeDefined();
    expect(screen.getAllByRole('note')).toHaveLength(2);
  });

  it('uses next/link for internal links and opens external links in a new tab, said in their name (2026-11-23)', () => {
    renderBlocks(helpArticleWhenCharged.blocks);
    const internal = screen.getByRole('link', { name: 'pricing page' });
    expect(internal.getAttribute('href')).toBe(routes.pricing());
    expect(internal.getAttribute('data-next-link')).toBe('true');
    const external = screen.getByRole('link', { name: 'Stripe (opens another site in a new tab)' });
    expect(external.getAttribute('href')).toBe('https://stripe.com');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('data-next-link')).toBeNull();
  });

  it('treats markup-looking text as text and supports third-level headings', () => {
    const { container } = renderBlocks([
      { type: 'heading', text: 'Details' },
      { type: 'paragraph', content: ['<b>Not HTML</b>', { text: '<img src=x onerror=alert(1)>', strong: true }] },
    ], 3);
    expect(screen.getByRole('heading', { level: 3, name: 'Details' })).toBeDefined();
    expect(screen.getByText('<b>Not HTML</b>')).toBeDefined();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
