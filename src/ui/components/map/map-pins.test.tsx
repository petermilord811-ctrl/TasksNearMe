/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapCluster, MapPin } from './map-pins';

/** The app map's pins, in the landing map's look but as named buttons (owner, 2026-11-25; accessibility pass J-A10). */

afterEach(cleanup);

const handlers = () => ({ onEnter: vi.fn(), onLeave: vi.fn(), onPick: vi.fn() });

describe('MapPin', () => {
  it('is a named button in its category’s color: a price chip close in, a dot farther out', () => {
    const on = handlers();
    const { rerender } = render(<MapPin placeId="tsk_desk" name="Assemble a desk, $60.00, Mueller" label="$60.00" categorySlug="furniture-assembly" chip lit={false} picked={false} {...on} />);
    const pin = screen.getByRole('button', { name: 'Assemble a desk, $60.00, Mueller' });
    expect(pin).toHaveAttribute('data-place-id', 'tsk_desk');
    expect(pin).toHaveTextContent('$60.00');
    const chip = pin.querySelector<HTMLElement>('span.h-8')!;
    expect(chip.style.borderColor).toContain('--cat-furniture-assembly');
    expect(chip.className).toContain('opacity-100');
    rerender(<MapPin placeId="tsk_desk" name="Assemble a desk, $60.00, Mueller" label="$60.00" categorySlug="furniture-assembly" chip={false} lit={false} picked={false} {...on} />);
    expect(pin.querySelector<HTMLElement>('span.h-8')!.className).toContain('opacity-0');
    expect(pin.querySelector<HTMLElement>('span.size-3\\.5')!.style.background).toContain('--cat-furniture-assembly');
  });

  it('lights with its category’s deeper shade, and reports pointing, focus and a pick', () => {
    const on = handlers();
    render(<MapPin placeId="tsk_yard" name="Rake leaves, $40.00, Crestview" label="$40.00" categorySlug="yard-cleanup" chip={false} lit picked={false} {...on} />);
    const pin = screen.getByRole('button', { name: 'Rake leaves, $40.00, Crestview' });
    // Lit, it's a chip even far out.
    const chip = pin.querySelector<HTMLElement>('span.h-8')!;
    expect(chip.className).toContain('opacity-100');
    expect(chip.style.background).toContain('color-mix');
    fireEvent.mouseEnter(pin);
    fireEvent.focus(pin);
    fireEvent.click(pin);
    expect(on.onEnter).toHaveBeenCalledTimes(2);
    expect(on.onPick).toHaveBeenCalledTimes(1);
  });

  it('keeps a plain chip for a place without a category (a task’s own area, the posting map)', () => {
    render(<MapPin placeId="area" name="Mueller, Austin" label="Mueller" chip lit={false} picked={false} {...handlers()} />);
    const pin = screen.getByRole('button', { name: 'Mueller, Austin' });
    expect(pin.querySelector('svg')).toBeNull();
    expect(pin.querySelector<HTMLElement>('span.h-8')!.className).toContain('border-border');
  });
});

describe('MapCluster', () => {
  it('is a named button with a donut of its categories and the count, and zooms in on a click', () => {
    const onExpand = vi.fn();
    render(<MapCluster placeIds={['a', 'b', 'c']} categories={['furniture-assembly', 'furniture-assembly', 'yard-cleanup']} name="3 tasks around here" lit={false} onEnter={() => {}} onLeave={() => {}} onExpand={onExpand} />);
    const group = screen.getByRole('button', { name: '3 tasks around here' });
    expect(group).toHaveTextContent('3');
    expect(group).toHaveAttribute('data-place-ids', 'a b c');
    const arcs = [...group.querySelectorAll('circle')].map((circle) => circle.getAttribute('stroke'));
    expect(arcs).toContain('var(--cat-furniture-assembly)');
    expect(arcs).toContain('var(--cat-yard-cleanup)');
    fireEvent.click(group);
    expect(onExpand).toHaveBeenCalled();
  });
});
