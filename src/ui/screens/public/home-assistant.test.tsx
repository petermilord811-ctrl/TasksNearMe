/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type LandingHandlers, type LandingAiSuggestResult } from '@/contracts';
import { homePageData } from '@/fixtures';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import messages from '../../../../messages/en/ui';
import { HomeScreen } from './home-screen';

const now = '2026-11-17T15:00:00.000Z';
const t = createTranslator({ locale: 'en', messages, namespace: 'landing' });
const categoryName = createTranslator({ locale: 'en', messages, namespace: 'helperCard.categories' });
const words = 'I need help to assemble an IKEA desk';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduce'), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The landing opens on "Can help"; these tests are about the "Need help" side's assistant, so they pick it first. */
function show(handlers: LandingHandlers = {}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandingHandlersProvider handlers={handlers}>
        <HomeScreen data={homePageData} now={now} mapMode="static" />
      </LandingHandlersProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.click(within(hero()).getByRole('button', { name: new RegExp(`^${t('hero.audience.poster')}`) }));
  return view;
}
const hero = () => document.querySelector<HTMLElement>('section[aria-labelledby="hero-title"]')!;
const field = () => screen.getByRole('textbox', { name: t('hero.askPrompt') });
function ask(text = words) {
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: text } });
  return screen.getByRole('region', { name: t('assistant.panelLabel') });
}

describe('the hero assistant', () => {
  it('folds into one line in place of the new tasks when left with words in it, and opens again from there', async () => {
    show();
    ask();
    fireEvent.pointerDown(document.body);
    // The suggestions fold away (after their exit animation).
    await waitFor(() => expect(screen.queryByRole('region', { name: t('assistant.panelLabel') })).not.toBeInTheDocument());
    const summary = within(hero()).getByRole('button', { name: t('assistant.summaryExpand', { text: words }) });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveTextContent(categoryName('furniture-assembly'));
    expect(within(hero()).getByRole('link', { name: t('assistant.summaryContinue') })).toHaveAttribute('href', routes.app.newTask({ category: 'furniture-assembly', describe: words }));
    fireEvent.click(summary);
    expect(screen.getByRole('region', { name: t('assistant.panelLabel') })).toBeInTheDocument();
  });

  it('writes the task with AI on request, then goes on to posting with that title and description', async () => {
    const draft = { title: 'Mount a 55" TV on drywall', description: 'The bracket is here; the wall is drywall over studs.' };
    const onSuggestWithAi = vi.fn(async (): Promise<LandingAiSuggestResult> => ({ ok: true, draft }));
    show({ onSuggestWithAi });
    const panel = ask();
    // With the page's own AI, the wizard's "Draft it with AI" isn't offered.
    expect(within(panel).queryByRole('link', { name: t('assistant.aiDraft') })).not.toBeInTheDocument();
    expect(onSuggestWithAi).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: t('assistant.aiWrite') }));
    });
    expect(onSuggestWithAi).toHaveBeenCalledWith({ text: words, category: 'furniture-assembly' });
    await waitFor(() => expect(within(panel).getByText(t('assistant.aiNote'))).toBeInTheDocument());
    expect(within(panel).getAllByText(draft.title).length).toBeGreaterThan(0);
    expect(within(panel).getByRole('link', { name: t('assistant.aiUse') })).toHaveAttribute('href', routes.app.newTask({ category: 'furniture-assembly', title: draft.title, describe: draft.description }));
    // Changing the words drops the draft (it was for the old ones).
    fireEvent.change(field(), { target: { value: `${words} please` } });
    expect(within(panel).queryByRole('link', { name: t('assistant.aiUse') })).not.toBeInTheDocument();
  });

  it('says why when AI can’t write, and offers the wizard’s draft after sign-in instead', async () => {
    show({ onSuggestWithAi: async () => ({ ok: false, code: 'rate_limited' }) });
    const panel = ask();
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: t('assistant.aiWrite') }));
    });
    await waitFor(() => expect(within(panel).getByText(t('assistant.aiErrors.rate_limited'))).toBeInTheDocument());
    expect(within(panel).getByRole('link', { name: t('assistant.aiDraft') })).toHaveAttribute('href', routes.app.newTask({ category: 'furniture-assembly', describe: words, ai: true }));
  });

  it('starts typing on "/" from anywhere on the page, but not from another field', () => {
    show();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(field());
    (document.activeElement as HTMLElement).blur();
    const other = screen.getByPlaceholderText(t('map.smartPlaceholder'));
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
  });

  it('offers back words typed earlier in this tab and never sent', () => {
    window.sessionStorage.setItem('tnm:assistant:poster:v1', 'assemble an ikea desk');
    show();
    fireEvent.focus(field());
    const panel = screen.getByRole('region', { name: t('assistant.panelLabel') });
    expect(within(panel).getByText(`${t('assistant.restoreTitle')}:`, { exact: false })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: t('assistant.restore') }));
    expect(field()).toHaveValue('assemble an ikea desk');
  });

  it('moves through the kinds of help with the arrow keys', () => {
    show();
    const panel = ask('something for my grandmother');
    const buttons = within(panel).getAllByRole('button', { pressed: false });
    const first = buttons.find((button) => button.textContent === categoryName('furniture-assembly'))!;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveTextContent(categoryName('moving-help'));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toHaveTextContent(categoryName('computer-help'));
  });
});
