/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { bookshelfBreakdown, bookshelfCounterBreakdown } from '@/fixtures';
import type { PricingInput } from '@/contracts';
import messages from '../../../messages/en/ui';
import { usePriceQuote } from './use-price-quote';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const pricing: PricingInput = { type: 'fixed', priceCents: 4500 };
const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;

it('starts deterministic previews with a supplied quote and requests a fresh quote after editing', async () => {
  vi.useFakeTimers();
  const onQuote = vi.fn(async () => bookshelfCounterBreakdown);
  const { result, rerender } = renderHook(({ input }: { input: PricingInput }) => usePriceQuote({ pricing: input, valid: true, onQuote, initialBreakdown: bookshelfBreakdown }), { initialProps: { input: pricing }, wrapper });
  expect(result.current.breakdown).toBe(bookshelfBreakdown);
  expect(result.current.pending).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).not.toHaveBeenCalled();
  rerender({ input: { type: 'fixed', priceCents: 5000 } });
  expect(result.current.breakdown).toBeUndefined();
  expect(result.current.pending).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).toHaveBeenCalledExactlyOnceWith({ pricing: { type: 'fixed', priceCents: 5000 } });
  expect(result.current.breakdown).toBe(bookshelfCounterBreakdown);
  rerender({ input: pricing });
  expect(result.current.breakdown).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).toHaveBeenCalledTimes(2);
});

it('does not reuse an initial quote after retrying or replacing the handler', async () => {
  vi.useFakeTimers();
  const first = vi.fn(async () => bookshelfBreakdown);
  const second = vi.fn(async () => bookshelfCounterBreakdown);
  const { result, rerender } = renderHook(({ onQuote }) => usePriceQuote({ pricing, valid: true, onQuote, initialBreakdown: bookshelfBreakdown }), { initialProps: { onQuote: first }, wrapper });
  act(() => result.current.retry());
  expect(result.current.pending).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(first).toHaveBeenCalledOnce();
  rerender({ onQuote: second });
  expect(result.current.breakdown).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.breakdown).toBe(bookshelfCounterBreakdown);
});

it('starts an error preview with a stable failure and retries through the handler', async () => {
  vi.useFakeTimers();
  const onQuote = vi.fn(async () => bookshelfBreakdown);
  const { result } = renderHook(() => usePriceQuote({ pricing, valid: true, onQuote, initialFailed: true }), { wrapper });
  expect(result.current.failed).toBe(true);
  expect(result.current.pending).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).not.toHaveBeenCalled();
  act(() => result.current.retry());
  expect(result.current.failed).toBe(false);
  expect(result.current.pending).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).toHaveBeenCalledExactlyOnceWith({ pricing });
  expect(result.current.breakdown).toEqual(bookshelfBreakdown);
});

it('skips invalid inputs and requires a fresh quote after they become valid again', async () => {
  vi.useFakeTimers();
  const onQuote = vi.fn().mockResolvedValue(bookshelfBreakdown);
  const { result, rerender } = renderHook(({ valid }) => usePriceQuote({ pricing, valid, onQuote }), { initialProps: { valid: false }, wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);

  rerender({ valid: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.breakdown).toEqual(bookshelfBreakdown);
  rerender({ valid: false });
  expect(result.current.breakdown).toBeUndefined();
  rerender({ valid: true });
  expect(result.current.pending).toBe(true);
  expect(result.current.breakdown).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onQuote).toHaveBeenCalledTimes(2);
});

it('discards a pending quote when its handler is replaced', async () => {
  vi.useFakeTimers();
  let resolveFirst!: (value: typeof bookshelfBreakdown) => void;
  const first = vi.fn(() => new Promise<typeof bookshelfBreakdown>((resolve) => { resolveFirst = resolve; }));
  const second = vi.fn(async () => bookshelfCounterBreakdown);
  const { result, rerender } = renderHook(({ onQuote }) => usePriceQuote({ pricing, valid: true, onQuote }), { initialProps: { onQuote: first }, wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  rerender({ onQuote: second });
  await act(async () => resolveFirst(bookshelfBreakdown));
  expect(result.current.breakdown).toBeUndefined();
  expect(result.current.pending).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.breakdown).toEqual(bookshelfCounterBreakdown);
});
