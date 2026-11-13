/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type HelpCenterData } from '@/contracts';
import { helpArticleWhenCharged, helpCenterData, legalTermsDraft } from '@/fixtures';
import { formatDate } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import help from '../../../../messages/en/ui/help.json';
import legal from '../../../../messages/en/ui/legal.json';
import legalEs from '../../../../messages/es/ui/legal.json';
import { HelpCenterScreen } from './help-center-screen';
import { HelpArticleScreen } from './help-article-screen';
import { LegalDocScreen } from './legal-doc-screen';

const allMessages = { ...messages, help, legal };
afterEach(cleanup);
function renderScreen(element: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={allMessages}>{element}</NextIntlClientProvider>);
}

describe('Help center', () => {
  it('filters only article titles and summaries, including case-insensitive refund searches', async () => {
    const user = userEvent.setup();
    const data: HelpCenterData = {
      topics: helpCenterData.topics.map((topic) => ({ ...topic, articles: topic.articles.map((article) => article.slug === helpArticleWhenCharged.slug ? { ...article, summary: 'Unused allowance is refunded.' } : article) })),
    };
    renderScreen(<HelpCenterScreen data={data} />);
    const search = screen.getByRole('searchbox', { name: help.searchLabel });
    await user.type(search, 'REFUND');
    expect(screen.getByRole('link', { name: /When am I charged/ }).getAttribute('href')).toBe(routes.help(helpArticleWhenCharged.slug));
    expect(screen.queryByRole('link', { name: /Canceling a booking/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 article found');
    await user.clear(search);
    await user.type(search, 'getting verified');
    expect(screen.getByRole('link', { name: /Getting verified as a helper/ })).toBeDefined();
    expect(screen.queryByRole('link', { name: /When am I charged/ })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows support when there are no matching articles and restores the list after clearing', async () => {
    const user = userEvent.setup();
    renderScreen(<HelpCenterScreen data={helpCenterData} />);
    const search = screen.getByRole('searchbox');
    await user.type(search, 'no-matching-article');
    expect(screen.getByRole('heading', { name: help.emptyTitle })).toBeDefined();
    expect(screen.getByRole('link', { name: help.supportLink }).getAttribute('href')).toBe(routes.app.support());
    await user.clear(search);
    expect(screen.getByRole('link', { name: /Posting your first task/ })).toBeDefined();
    expect(screen.queryByRole('heading', { name: help.emptyTitle })).toBeNull();
  });
});

describe('Help article', () => {
  it('uses the topic anchor, formatted update date, related article routes, and one H1', () => {
    renderScreen(<HelpArticleScreen data={helpArticleWhenCharged} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: helpArticleWhenCharged.topic.title }).getAttribute('href')).toBe(`${routes.help()}#payments`);
    expect(screen.getByText(`Updated ${formatDate(helpArticleWhenCharged.updatedAt, { withYear: true })}`)).toBeDefined();
    expect(screen.getByRole('link', { name: /Canceling a booking/ }).getAttribute('href')).toBe(routes.help('cancel-a-booking'));
  });
});

describe('Legal document', () => {
  it('says it is in English only on a Spanish page, and marks its text as English', () => {
    const { container, rerender } = render(<NextIntlClientProvider locale="es" messages={{ ...allMessages, legal: legalEs }}><LegalDocScreen data={legalTermsDraft} /></NextIntlClientProvider>);
    expect(screen.getByText(legalEs.englishOnlyTitle)).toBeDefined();
    expect(screen.getByText(legalEs.englishOnlyDescription)).toBeDefined();
    expect(container.querySelector(`section#${legalTermsDraft.sections[0]!.id}`)?.getAttribute('lang')).toBe('en');
    rerender(<NextIntlClientProvider locale="en" messages={allMessages}><LegalDocScreen data={legalTermsDraft} /></NextIntlClientProvider>);
    expect(screen.queryByText(legal.englishOnlyTitle)).toBeNull();
  });

  it('warns only for drafts and renders the published effective date', () => {
    const { rerender } = renderScreen(<LegalDocScreen data={legalTermsDraft} />);
    expect(screen.getByText(legal.draftTitle)).toBeDefined();
    expect(screen.getByText(legal.draftDescription)).toBeDefined();
    const published = { ...legalTermsDraft, status: 'published' as const, version: 'Version 1.0', effectiveAt: legalTermsDraft.updatedAt };
    rerender(<NextIntlClientProvider locale="en" messages={allMessages}><LegalDocScreen data={published} /></NextIntlClientProvider>);
    expect(screen.queryByText(legal.draftTitle)).toBeNull();
    expect(screen.queryByText(legal.draftDescription)).toBeNull();
    expect(screen.getByText(`Effective ${formatDate(published.effectiveAt, { withYear: true })}`)).toBeDefined();
  });

  it('connects the table of contents and other policy links to their destinations', () => {
    const { container } = renderScreen(<LegalDocScreen data={legalTermsDraft} />);
    for (const section of legalTermsDraft.sections) {
      expect(screen.getByRole('link', { name: section.title }).getAttribute('href')).toBe(`#${section.id}`);
      expect(container.querySelector(`[id="${section.id}"]`)).toBeDefined();
    }
    for (const document of legalTermsDraft.otherDocs) expect(screen.getByRole('link', { name: document.title }).getAttribute('href')).toBe(routes.legal(document.doc));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
