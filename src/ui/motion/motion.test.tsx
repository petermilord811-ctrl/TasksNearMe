/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@/shared/format';
import { CountUpMoney, HoverLift, Magnetic, MaskLines, MotionRoot, Reveal } from '.';

const observe = vi.fn();

beforeEach(() => {
  // A mouse user who asked for reduced motion.
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('reduce') || query.includes('pointer: fine'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('IntersectionObserver', class { observe = observe; unobserve() {} disconnect() {} });
  document.documentElement.dataset.motion = 'off';
});

afterEach(() => {
  cleanup();
  observe.mockReset();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.motion;
});

describe('motion primitives under reduced motion', () => {
  it('CountUpMoney shows the exact amount at once and never starts counting', () => {
    render(<CountUpMoney cents={6600} />);
    expect(screen.getAllByText(formatMoney(6600))).toHaveLength(2);
    expect(observe).not.toHaveBeenCalled();
  });

  it('Magnetic never moves what it holds', () => {
    render(<Magnetic><button type="button">Go</button></Magnetic>);
    fireEvent.pointerMove(window, { clientX: 4, clientY: 4 });
    expect(screen.getByRole('button').parentElement?.style.transform ?? '').toBe('');
  });

  it('MaskLines renders every line in place, as words', () => {
    const { container } = render(<h1><MaskLines lines={['Everyday tasks,', 'done by people', 'nearby.']} /></h1>);
    expect(container.textContent).toBe('Everyday tasks, done by people nearby.');
    expect(container.querySelector('[style*="transform"]')).toBeNull();
  });

  it('HoverLift shows its light at once on hover but never moves the surface, and lets go on leave', () => {
    const { container } = render(<HoverLift surfaceClassName="card"><a href="https://example.test/x">Card</a></HoverLift>);
    const outer = container.firstElementChild as HTMLElement;
    const surface = outer.querySelector<HTMLElement>('.lift-surface')!;
    fireEvent.pointerEnter(outer, { pointerType: 'mouse' });
    fireEvent.pointerMove(outer, { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(outer).toHaveAttribute('data-hovered');
    expect(outer.style.getPropertyValue('--hover')).toBe('1.0000');
    expect(surface.style.transform).toBe('');
    fireEvent.pointerLeave(outer, { pointerType: 'mouse' });
    expect(outer).not.toHaveAttribute('data-hovered');
    expect(outer.style.getPropertyValue('--hover')).toBe('0.0000');
    // The link inside is untouched and still the thing you reach.
    expect(screen.getByRole('link', { name: 'Card' })).toHaveAttribute('href', 'https://example.test/x');
  });

  it('Reveal only marks its content, and MotionRoot leaves the page as it is', () => {
    render(<><MotionRoot /><Reveal><p>Shown</p></Reveal></>);
    expect(screen.getByText('Shown').parentElement).toHaveAttribute('data-reveal', '');
    expect(document.documentElement.dataset.motion).toBe('off');
    expect(observe).not.toHaveBeenCalled();
  });
});
