'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { ImagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface FileChooserProps {
  /** The file input's id (a field label can point at it too). */
  id: string;
  /** The id of the visible field label: the input's accessible name. */
  labelledBy: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  busy?: boolean;
  invalid?: boolean;
  describedBy?: string;
  name?: string;
  required?: boolean;
  /**
   * The form reads the file when it's submitted: the choice stays in the input and its name is shown. By
   * default the input is cleared after each choice, so the same file can be chosen again.
   */
  keepSelection?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onFiles?: (files: File[]) => void;
  /** For the outer box (spacing, scroll margins). */
  className?: string;
}

/**
 * Choosing photos (UI-021): a button for the file input and, on wider screens, a drop zone. The real input
 * stays in the page, visually hidden but focusable, so keyboards and screen readers use it directly; the
 * button shows its focus ring. Its name comes from the field label (`labelledBy`).
 */
export function FileChooser({
  id,
  labelledBy,
  accept,
  multiple = false,
  disabled = false,
  busy = false,
  invalid = false,
  describedBy,
  name,
  required,
  keepSelection = false,
  inputRef,
  onFiles,
  className,
}: FileChooserProps) {
  const t = useTranslations('forms.upload');
  // The parent's ref (to focus the field) goes on the input; the box finds the input and its form.
  const box = useRef<HTMLDivElement>(null);
  const input = () => box.current?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  const [dragging, setDragging] = useState(false);
  const [chosen, setChosen] = useState<string>();

  // A form reset clears the input; the name shown goes with it.
  useEffect(() => {
    const form = box.current?.closest('form');
    if (!keepSelection || !form) return;
    const clear = () => setChosen(undefined);
    form.addEventListener('reset', clear);
    return () => form.removeEventListener('reset', clear);
  }, [keepSelection]);

  function take(files: File[]) {
    if (files.length === 0) return;
    if (keepSelection) setChosen(files[0]!.name);
    onFiles?.(files);
  }

  return <div
    ref={box}
    data-dragging={dragging || undefined}
    onDragOver={(event) => {
      if (disabled) return;
      event.preventDefault();
      setDragging(true);
    }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer.files).slice(0, multiple ? undefined : 1);
      // A form that reads the input on submit gets the dropped file in it.
      const target = input();
      if (keepSelection && target && typeof DataTransfer !== 'undefined') {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        target.files = transfer.files;
      }
      take(files);
    }}
    className={cn(
      'flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-3 transition-colors sm:items-center sm:p-5 sm:text-center',
      dragging && 'border-primary bg-accent',
      invalid && 'border-destructive',
      disabled && 'opacity-70',
      className,
    )}
  >
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="file"
      accept={accept}
      multiple={multiple}
      required={required}
      disabled={disabled}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-busy={busy || undefined}
      className="peer sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        if (!keepSelection) event.target.value = '';
        take(files);
      }}
    />
    <label
      htmlFor={id}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'min-h-11 cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50',
      )}
    >
      <ImagePlus aria-hidden="true" className="size-4" />
      {multiple ? t('choosePhotos') : t('choosePhoto')}
    </label>
    <p aria-hidden="true" className="hidden text-sm text-muted-foreground sm:block">{multiple ? t('dropPhotos') : t('dropPhoto')}</p>
    {keepSelection && chosen && <p className="max-w-full break-words text-sm font-medium">{t('chosen', { name: chosen })}</p>}
  </div>;
}
