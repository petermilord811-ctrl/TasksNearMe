/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type AiSearchResult } from '@/contracts';
import uiMessages from '../../../messages/en/ui';
import { AppSearch } from './app-search';
import { buildSearchSuggestions } from './app-search-suggestions';
import { getAppNav } from './nav';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/app/bookings' }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const pages = (mode: 'poster' | 'helper') => {
  const nav = getAppNav(mode);
  return [...nav.primary, ...nav.secondary, ...nav.account].map((item) => ({ item, label: uiMessages.shell.nav[item.id as keyof typeof uiMessages.shell.nav] }));
};

describe('the search bar suggestions (owner, 2026-11-23)', () => {
  it('reads a client\'s words on the device: Ask AI, post them as a task with the category, helpers for it, Neighbors', () => {
    const suggestions = buildSearchSuggestions({ text: 'assemble an IKEA desk', mode: 'poster', aiAvailable: true, onNeighbors: false, pages: pages('poster') });
    expect(suggestions.map((suggestion) => suggestion.kind)).toEqual(['ask_ai', 'post_task', 'find_helpers', 'neighbors']);
    expect(suggestions[1]).toMatchObject({ kind: 'post_task', category: 'furniture-assembly', href: routes.app.newTask({ describe: 'assemble an IKEA desk', title: 'Assemble an IKEA desk', category: 'furniture-assembly' }) });
    expect(suggestions[2]).toMatchObject({ href: routes.app.helpers({ category: 'furniture-assembly' }) });
  });

  it('leads a helper to tasks, and searches Neighbors first on Neighbors', () => {
    expect(buildSearchSuggestions({ text: 'rake leaves', mode: 'helper', aiAvailable: false, onNeighbors: false, pages: pages('helper') }).map((s) => s.kind)).toEqual(['find_work', 'post_task', 'neighbors']);
    expect(buildSearchSuggestions({ text: 'rake leaves', mode: 'helper', aiAvailable: false, onNeighbors: true, pages: pages('helper') }).map((s) => s.kind)).toEqual(['neighbors', 'find_work', 'post_task']);
  });

  it('finds pages by name and never suggests posting work the platform doesn\'t offer', () => {
    expect(buildSearchSuggestions({ text: 'book', mode: 'poster', aiAvailable: false, onNeighbors: false, pages: pages('poster') }).filter((s) => s.kind === 'page')).toEqual([{ id: 'page-bookings', kind: 'page', href: routes.app.bookings(), nav: 'bookings' }]);
    expect(buildSearchSuggestions({ text: 'mount my TV', mode: 'poster', aiAvailable: false, onNeighbors: false, pages: pages('poster') }).some((s) => s.kind === 'post_task')).toBe(false);
    expect(buildSearchSuggestions({ text: 'a', mode: 'poster', aiAvailable: true, onNeighbors: false, pages: pages('poster') })).toEqual([]);
  });
});

describe('the search bar', () => {
  const show = (onAsk?: (input: { text: string }) => Promise<AiSearchResult>) =>
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AppSearch mode="poster" {...(onAsk ? { onAsk } : {})} /></NextIntlClientProvider>);

  it('suggests as someone types and opens the first suggestion with Enter', () => {
    show();
    const field = screen.getByRole('combobox', { name: 'Search TasksNearMe' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'help moving a couch' } });
    expect(screen.getByRole('option', { name: /Post a task: Moving a couch/ })).toBeInTheDocument();
    fireEvent.submit(field.closest('form')!);
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/app/tasks/new'));
  });

  it('moves through the suggestions with the arrow keys', () => {
    show();
    const field = screen.getByRole('combobox', { name: 'Search TasksNearMe' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'yard cleanup' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /helpers near you/ }).id);
  });

  it('asks AI only when chosen, and shows what it found under the field', async () => {
    const onAsk = vi.fn(async (): Promise<AiSearchResult> => ({ ok: false, code: 'monthly_limit' }));
    show(onAsk);
    const field = screen.getByRole('combobox', { name: 'Search TasksNearMe' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'clean my kitchen' } });
    expect(onAsk).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /Ask AI/ })); });
    expect(onAsk).toHaveBeenCalledWith({ text: 'clean my kitchen' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plans/i })).toHaveAttribute('href', routes.app.plan());
  });

  it('focuses from anywhere with the slash key', () => {
    show();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('combobox', { name: 'Search TasksNearMe' })).toHaveFocus();
  });
});
