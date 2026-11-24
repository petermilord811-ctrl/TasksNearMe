/** @vitest-environment jsdom */
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypewriterHint, typingDelay, typingStep, type TypingState } from './assistant-parts';

/** The hero's typing examples (2026-11-24, round three): written by hand on the shared frame clock, no render each. */

describe('the typing steps', () => {
  it('types, holds, erases and moves on to the next example', () => {
    const states: TypingState[] = [{ index: 0, shown: 0, erasing: false }];
    for (let i = 0; i < 6; i++) states.push(typingStep(states.at(-1)!, 'ab'));
    expect(states.map((s) => `${s.index}:${s.shown}${s.erasing ? 'e' : ''}`)).toEqual(['0:0', '0:1', '0:2', '0:2e', '0:1e', '0:0e', '1:0']);
    expect(typingDelay({ index: 0, shown: 1, erasing: false }, 'ab')).toBe(52);
    expect(typingDelay({ index: 0, shown: 2, erasing: false }, 'ab')).toBe(1700);
    expect(typingDelay({ index: 0, shown: 1, erasing: true }, 'ab')).toBe(22);
    expect(typingDelay({ index: 0, shown: 0, erasing: true }, 'ab')).toBe(380);
  });
});

describe('TypewriterHint', () => {
  let callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const original = { raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame };
  /** Runs the frame callbacks waiting now, with this timestamp. */
  const frameAt = (now: number) => {
    const waiting = [...callbacks.values()];
    callbacks = new Map();
    for (const callback of waiting) callback(now);
  };
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      callbacks.delete(id);
    };
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    window.requestAnimationFrame = original.raf;
    window.cancelAnimationFrame = original.caf;
  });

  it('writes the characters on frames of the shared clock without rendering again, and rests on the whole example', () => {
    let commits = 0;
    const phrases = ['Fix a tap', 'Walk Rex'];
    const view = (active: boolean) => (
      <Profiler id="hint" onRender={() => void (commits += 1)}>
        <TypewriterHint phrases={phrases} active={active} />
      </Profiler>
    );
    act(() => {
      root = createRoot(container);
      root.render(view(true));
    });
    const text = () => container.querySelector('span > span')!.textContent;
    expect(text()).toBe('');
    // One text node throughout, its characters changed in place (a change of characters, not of the page's tree).
    const node = container.querySelector('span > span')!.firstChild;
    expect(node?.nodeType).toBe(Node.TEXT_NODE);
    const before = commits;
    // 30 frames a second on the shared clock: 0, 34, 67, 100, 134 ms… The first character is due 52 ms after the first.
    frameAt(0);
    frameAt(17); // the same 33 ms period as 0: not drawn
    expect(text()).toBe('');
    frameAt(34);
    expect(text()).toBe('');
    frameAt(67);
    expect(text()).toBe('F');
    for (let t = 100; t <= 560; t += 33.4) frameAt(t);
    expect(text()).toBe('Fix a tap');
    expect(commits).toBe(before);
    expect(container.querySelector('span > span')!.firstChild).toBe(node);

    act(() => root!.render(view(false)));
    expect(text()).toBe('Fix a tap');
    expect(callbacks.size).toBe(0);
  });

  it('starts over when the examples change', () => {
    act(() => {
      root = createRoot(container);
      root.render(<TypewriterHint phrases={['Fix a tap']} active />);
    });
    for (let t = 0; t <= 600; t += 33.4) frameAt(t);
    expect(container.querySelector('span > span')!.textContent).toBe('Fix a tap');
    act(() => root!.render(<TypewriterHint phrases={['Walk Rex']} active={false} />));
    expect(container.querySelector('span > span')!.textContent).toBe('Walk Rex');
  });
});
