'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { cn } from '@/ui/lib/utils';
import { dueFrame } from '../frame-clock';

const TYPE_MS = 52;
const ERASE_MS = 22;
const HOLD_MS = 1700;
const GAP_MS = 380;

/** Where the typing is: which example, how many of its characters show, and whether it's being erased. */
export interface TypingState {
  index: number;
  shown: number;
  erasing: boolean;
}

const TYPING_START: TypingState = { index: 0, shown: 0, erasing: false };

/** How long the typing waits before its next step from `state`. */
export function typingDelay(state: TypingState, phrase: string): number {
  if (!state.erasing && state.shown >= phrase.length) return HOLD_MS;
  if (state.erasing && state.shown === 0) return GAP_MS;
  return state.erasing ? ERASE_MS : TYPE_MS;
}

/** The typing's next step: a character more or less, the turn to erasing once written, the next example once erased. */
export function typingStep(state: TypingState, phrase: string): TypingState {
  if (!state.erasing && state.shown >= phrase.length) return { ...state, erasing: true };
  if (state.erasing && state.shown === 0) return { index: state.index + 1, shown: 0, erasing: false };
  return { ...state, shown: state.shown + (state.erasing ? -1 : 1) };
}

/**
 * Example requests that type themselves out and erase, one after another, over an empty field (decorative: the
 * field keeps a plain placeholder for screen readers). It runs only while `active` (the field is empty, on screen,
 * the tab visible, motion allowed); otherwise it rests on the current example, fully written.
 *
 * The characters are written straight into the text (no render per character), on the landing's shared 30-a-second
 * frame clock: they show on the frames the town and the weather draw anyway (2026-11-24, round three; it used to
 * re-render about ten times a second on timers of its own, each change a frame of its own).
 */
export function TypewriterHint({ phrases, active, className }: { phrases: string[]; active: boolean; className?: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const state = useRef<TypingState>(TYPING_START);
  const key = phrases.join('\n');
  const stateKey = useRef(key);

  useEffect(() => {
    const node = textRef.current;
    const list = key ? key.split('\n') : [];
    if (!node || list.length === 0) return;
    // Another list of examples (the other audience's, another season's) starts over from its first.
    if (stateKey.current !== key) {
      stateKey.current = key;
      state.current = TYPING_START;
    }
    const phraseAt = (index: number) => list[index % list.length] ?? '';
    // The text node's own characters change in place: replacing the node would be a change to the page's tree, which
    // makes the browser re-check far more of the page than a change of characters.
    const write = (text: string) => {
      const first = node.firstChild;
      if (first && first === node.lastChild && first.nodeType === Node.TEXT_NODE) (first as Text).data = text;
      else node.textContent = text;
    };
    if (!active) {
      write(phraseAt(state.current.index));
      return;
    }
    write(phraseAt(state.current.index).slice(0, state.current.shown));
    let frame = 0;
    let last = 0;
    let due = 0;
    const loop = (now: number) => {
      frame = window.requestAnimationFrame(loop);
      if (!dueFrame(now, last, 30)) return;
      last = now;
      let next = state.current;
      // The first frame, or one long after the last (a busy moment): carry on from now, not from the past.
      if (!due || now - due > 1000) due = now + typingDelay(next, phraseAt(next.index));
      while (now >= due) {
        next = typingStep(next, phraseAt(next.index));
        due += typingDelay(next, phraseAt(next.index));
      }
      if (next === state.current) return;
      state.current = next;
      write(phraseAt(next.index).slice(0, next.shown));
    };
    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      write(phraseAt(state.current.index));
    };
  }, [active, key]);

  return (
    <span aria-hidden="true" className={cn('pointer-events-none truncate', className)}>
      {/* The server's text: the first example, written out. From then on the typing writes here by hand. */}
      <span ref={textRef}>{phrases[0] ?? ''}</span>
      {active && <span className="assistant-caret ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] bg-current" />}
    </span>
  );
}

/** Reveals `text` a few characters at a time (about a second in all); at once when `instant`. */
export function useReveal(text: string, instant: boolean): string {
  const [count, setCount] = useState(instant ? text.length : 0);
  const [source, setSource] = useState(text);
  if (source !== text) {
    setSource(text);
    setCount(instant ? text.length : 0);
  }
  useEffect(() => {
    if (instant || count >= text.length) return;
    const step = Math.max(1, Math.ceil(text.length / 45));
    const timer = window.setTimeout(() => setCount((value) => Math.min(text.length, value + step)), 22);
    return () => window.clearTimeout(timer);
  }, [instant, count, text]);
  return instant ? text : text.slice(0, count);
}

/** How sure the instant reading is, as three small bars (the words go to screen readers and the tooltip). */
export function ConfidenceBars({ level, label }: { level: 'low' | 'medium' | 'high'; label: string }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[2px]" title={label}>
      {[0, 1, 2].map((bar) => (
        <span key={bar} aria-hidden="true" className={cn('w-[3px] rounded-full', bar < filled ? 'bg-violet' : 'bg-foreground/15')} style={{ height: 5 + bar * 3 }} />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function confidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

// ---- Speech input --------------------------------------------------------------------------------------

interface RecognitionResultList {
  length: number;
  [index: number]: { length: number; [index: number]: { transcript: string } };
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
const noSubscribe = () => () => {};

/**
 * Speaking instead of typing, with the browser's own speech recognition (offered only where the browser has it;
 * it starts only on a tap, and the browser's speech service does the transcribing). `onText` gets the words as
 * they come in.
 */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionConstructor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const recognition = useRef<RecognitionLike | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  });
  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    recognition.current?.abort();
    const next = new Recognition();
    next.lang = 'en-US';
    next.interimResults = true;
    next.continuous = false;
    next.maxAlternatives = 1;
    next.onresult = (event) => {
      let words = '';
      for (let i = 0; i < event.results.length; i += 1) words += event.results[i]![0]!.transcript;
      latest.current(words.trim());
    };
    next.onend = () => setListening(false);
    next.onerror = () => {
      setFailed(true);
      setListening(false);
    };
    recognition.current = next;
    setFailed(false);
    setListening(true);
    try {
      next.start();
    } catch {
      setFailed(true);
      setListening(false);
    }
  }, []);
  const stop = useCallback(() => recognition.current?.stop(), []);
  return { supported, listening, failed, start, stop };
}

/** Arrow keys (and Home / End) move between the buttons of a list, like a toolbar. */
export function moveWithArrows(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0 && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const next =
    event.key === 'Home' ? 0
    : event.key === 'End' ? buttons.length - 1
    : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at + 1) % buttons.length
    : (at - 1 + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
