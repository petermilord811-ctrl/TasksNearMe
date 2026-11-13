'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { cn } from '@/ui/lib/utils';

const TYPE_MS = 52;
const ERASE_MS = 22;
const HOLD_MS = 1700;
const GAP_MS = 380;

/**
 * Example requests that type themselves out and erase, one after another, over an empty field (decorative: the
 * field keeps a plain placeholder for screen readers). It runs only while `active` (the field is empty, on screen,
 * the tab visible, motion allowed); otherwise it rests on the current example, fully written.
 */
export function TypewriterHint({ phrases, active, className }: { phrases: string[]; active: boolean; className?: string }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [erasing, setErasing] = useState(false);
  const phrase = phrases[index % Math.max(1, phrases.length)] ?? '';

  useEffect(() => {
    if (!active || !phrase) return;
    let delay = erasing ? ERASE_MS : TYPE_MS;
    if (!erasing && shown >= phrase.length) delay = HOLD_MS;
    if (erasing && shown === 0) delay = GAP_MS;
    const timer = window.setTimeout(() => {
      if (!erasing && shown >= phrase.length) setErasing(true);
      else if (erasing && shown === 0) {
        setErasing(false);
        setIndex((value) => value + 1);
      } else setShown((value) => value + (erasing ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, phrase, shown, erasing]);

  const text = active ? phrase.slice(0, shown) : phrase;
  return (
    <span aria-hidden="true" className={cn('pointer-events-none truncate', className)}>
      {text}
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
