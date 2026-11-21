'use client';

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Bold, Eye, Heading2, Italic, List, ListOrdered, type LucideIcon } from 'lucide-react';
import { Textarea } from '@/ui/primitives/textarea';
import { cn } from '@/ui/lib/utils';
import { continueListOnEnter, formatEdit, type RichFormat, type TextEdit } from './format-commands';
import { hasRichFormatting, htmlToRichText } from './paste';
import { RichText } from './rich-text';

/**
 * A text field with formatting (src/shared/rich-text.ts): a toolbar for bold, italic, headings and lists, a preview
 * of how it will read, and Enter that carries a list on. The value stays plain text with light marks, so it posts,
 * validates and counts like any other field. Pasting from a page or a doc keeps its headings, lists and bold.
 */
export interface RichTextEditorLabels {
  toolbar: string;
  bold: string;
  italic: string;
  heading: string;
  bullets: string;
  numbers: string;
  preview: string;
  emptyPreview: string;
}

export interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  /** The textarea, for focusing it on an error. */
  textareaRef?: Ref<HTMLTextAreaElement>;
  labels: RichTextEditorLabels;
  maxLength?: number;
  rows?: number;
  /** Read-only for now, e.g. while an AI rewrites the text. */
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Under the text, inside the field: an action on the left, a counter on the right. */
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** The preview's heading level (one below the field's own section). */
  previewHeadingLevel?: 2 | 3 | 4 | 5;
  className?: string;
}

const FORMATS: { format: RichFormat; icon: LucideIcon; label: keyof RichTextEditorLabels; keys?: string }[] = [
  { format: 'bold', icon: Bold, label: 'bold', keys: 'Control+B Meta+B' },
  { format: 'italic', icon: Italic, label: 'italic', keys: 'Control+I Meta+I' },
  { format: 'heading', icon: Heading2, label: 'heading' },
  { format: 'bullets', icon: List, label: 'bullets' },
  { format: 'numbers', icon: ListOrdered, label: 'numbers' },
];

const toolButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-primary/10 aria-pressed:text-primary';

export function RichTextEditor({ id, value, onChange, onBlur, name, textareaRef, labels, maxLength, rows = 5, readOnly = false, invalid = false, describedBy, footerStart, footerEnd, previewHeadingLevel = 3, className }: RichTextEditorProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  // Set once the textarea mounts, which is before a parent can use the ref.
  useImperativeHandle(textareaRef, () => area.current!, []);
  const [previewing, setPreviewing] = useState(false);
  // An error is fixed in the text, so it shows the text, not the preview.
  const [shownInvalid, setShownInvalid] = useState(invalid);
  if (invalid !== shownInvalid) {
    setShownInvalid(invalid);
    if (invalid) setPreviewing(false);
  }
  // The selection when the field last had focus: a tap on the toolbar can take focus away on touch screens.
  const selection = useRef<[number, number]>([value.length, value.length]);
  const pendingSelection = useRef<[number, number] | null>(null);

  useEffect(() => {
    const element = area.current;
    const wanted = pendingSelection.current;
    if (!element || !wanted) return;
    pendingSelection.current = null;
    element.setSelectionRange(wanted[0], wanted[1]);
  });

  /** Apply an edit as typing, so the browser's undo can take it back; set the value directly where that can't run. */
  function replace(edit: TextEdit) {
    const element = area.current;
    if (!element) return;
    const before = element.value;
    const expected = before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
    element.focus();
    element.setSelectionRange(edit.from, edit.to);
    let typed = false;
    try {
      typed = typeof document.execCommand === 'function' && document.execCommand('insertText', false, edit.insert);
    } catch {
      typed = false;
    }
    if (typed && element.value === expected) {
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    } else {
      pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
      onChange(expected);
    }
    selection.current = [edit.selectionStart, edit.selectionEnd];
  }

  function apply(format: RichFormat) {
    const element = area.current;
    if (!element || readOnly) return;
    const focused = document.activeElement === element;
    const [start, end] = focused ? [element.selectionStart, element.selectionEnd] : selection.current;
    replace(formatEdit(element.value, Math.min(start, element.value.length), Math.min(end, element.value.length), format));
  }

  return <div className={cn('rounded-[1.125rem] border border-input bg-card shadow-[inset_0_1px_2px_rgb(23_18_14/0.05)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out)] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 dark:bg-white/[0.035] dark:shadow-none', invalid && 'border-destructive ring-[3px] ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20 dark:ring-destructive/40', className)} data-invalid={invalid || undefined}>
    <div role="toolbar" aria-label={labels.toolbar} aria-controls={id} className="flex flex-wrap items-center gap-0.5 border-b border-input/70 p-1">
      {FORMATS.map(({ format, icon: Icon, label, keys }) => <button key={format} type="button" className={toolButton} aria-label={labels[label]} title={labels[label]} aria-keyshortcuts={keys} disabled={readOnly || previewing} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(format)}><Icon aria-hidden="true" className="size-[1.125rem]" /></button>)}
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
      <button type="button" className={cn(toolButton, 'ml-auto w-auto min-w-11 gap-2 px-3 text-sm font-medium')} aria-pressed={previewing} aria-controls={`${id}-preview`} onClick={() => setPreviewing((current) => !current)}>
        <Eye aria-hidden="true" className="size-[1.125rem]" /><span className="max-[23.5rem]:sr-only">{labels.preview}</span>
      </button>
    </div>
    <div id={`${id}-preview`} hidden={!previewing} aria-label={labels.preview} role="region" className="min-h-32 px-3.5 py-3">
      {previewing && (value.trim() ? <RichText text={value} headingLevel={previewHeadingLevel} /> : <p className="text-muted-foreground">{labels.emptyPreview}</p>)}
    </div>
    <Textarea
      ref={area}
      id={id}
      name={name}
      value={value}
      rows={rows}
      maxLength={maxLength}
      readOnly={readOnly}
      hidden={previewing}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        const element = area.current;
        if (element) selection.current = [element.selectionStart, element.selectionEnd];
        onBlur?.();
      }}
      onSelect={(event) => { selection.current = [event.currentTarget.selectionStart, event.currentTarget.selectionEnd]; }}
      onKeyDown={(event) => {
        if (readOnly || event.nativeEvent.isComposing) return;
        const element = event.currentTarget;
        const mod = event.ctrlKey || event.metaKey;
        if (mod && !event.altKey && !event.shiftKey && (event.key === 'b' || event.key === 'B' || event.key === 'i' || event.key === 'I')) {
          event.preventDefault();
          apply(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
          return;
        }
        if (event.key === 'Enter' && !mod && !event.shiftKey && !event.altKey) {
          const edit = continueListOnEnter(element.value, element.selectionStart, element.selectionEnd);
          if (edit) {
            event.preventDefault();
            replace(edit);
          }
        }
      }}
      onPaste={(event) => {
        if (readOnly) return;
        const html = event.clipboardData.getData('text/html');
        if (!html || !hasRichFormatting(html)) return;
        const text = htmlToRichText(html);
        if (!text) return;
        event.preventDefault();
        const element = event.currentTarget;
        const start = element.selectionStart;
        const end = element.selectionEnd;
        replace({ from: start, to: end, insert: text, selectionStart: start + text.length, selectionEnd: start + text.length });
      }}
      className={cn('min-h-32 rounded-none border-0 bg-transparent px-3.5 py-3 shadow-none hover:border-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent', readOnly && 'text-muted-foreground')}
    />
    {(footerStart || footerEnd) && <div className="flex flex-wrap items-center gap-2 border-t border-input/70 px-2 py-1.5">
      {footerStart}
      {footerEnd && <div className="ml-auto pr-1.5">{footerEnd}</div>}
    </div>}
  </div>;
}
