'use client';

import { useId, useRef, useState, type ClipboardEvent, type Ref } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';

/**
 * A one-time code shown as six boxes, as people expect from other apps. Underneath it's one real input
 * (`autocomplete="one-time-code"`, numeric keyboard), so pasting the whole code, the phone's "from Messages"
 * suggestion and screen readers all work the same as a plain field; the boxes only draw its characters and
 * where the next digit goes. Letters and spaces are dropped as they're typed or pasted. When the last digit
 * arrives, `onComplete` runs once for that code (the form submits it).
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  onBlur,
  length = 6,
  id,
  name,
  invalid = false,
  disabled = false,
  autoFocus = false,
  describedBy,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  onBlur?: () => void;
  length?: number;
  id: string;
  name?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  /** The real input (react-hook-form focuses it on an error). */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const completedFor = useRef<string | null>(null);
  const digits = value.replace(/\D/g, '').slice(0, length);
  const active = Math.min(digits.length, length - 1);

  const accept = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length && completedFor.current !== next) {
      completedFor.current = next;
      onComplete?.(next);
    }
    if (next.length < length) completedFor.current = null;
  };

  return (
    <div className="relative w-fit max-w-full" onClick={(event) => event.currentTarget.querySelector('input')?.focus()}>
      <div aria-hidden="true" className="flex gap-1.5 sm:gap-2">
        {Array.from({ length }, (_, index) => {
          const char = digits[index];
          const current = focused && index === active && !disabled;
          return (
            <div
              key={index}
              className={cn(
                'relative grid h-12 w-10 place-items-center rounded-xl border-2 bg-card text-2xl font-semibold tabular-nums transition-[border-color,box-shadow,transform] duration-150 sm:h-14 sm:w-12',
                char ? 'border-foreground/35' : 'border-input',
                current && 'border-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]',
                invalid && 'border-destructive',
                disabled && 'opacity-60',
                index === length / 2 - 1 && 'mr-1.5 sm:mr-2.5',
              )}
            >
              {char ?? ''}
              {current && !char && <span className="absolute h-6 w-0.5 animate-pulse rounded-full bg-primary" />}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        id={id}
        name={name}
        value={digits}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={length}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => accept(event.target.value)}
        onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
          event.preventDefault();
          accept(event.clipboardData.getData('text'));
        }}
        onFocus={(event) => {
          setFocused(true);
          // Typing always continues at the end, like the boxes show.
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent [-webkit-text-fill-color:transparent] disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** The code field of a form (react-hook-form): label, the boxes, the hint and the error, like TextFormField. */
export function CodeFormField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  onComplete,
  disabled,
  autoFocus,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint: string;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const t = useTranslations('forms');
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const code = fieldState.error?.message;
        return (
          <Field data-invalid={fieldState.invalid} className="gap-2">
            <FieldLabel htmlFor={id} className="text-foreground">{label}</FieldLabel>
            <CodeInput
              id={id}
              name={field.name}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              onComplete={onComplete}
              inputRef={field.ref}
              invalid={fieldState.invalid}
              disabled={disabled}
              autoFocus={autoFocus}
              describedBy={`${id}-hint${code ? ` ${id}-error` : ''}`}
            />
            <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
            {code && <FieldError id={`${id}-error`}>{t(t.has(`fields.code.${code}`) ? `fields.code.${code}` : t.has(`fieldErrors.${code}`) ? `fieldErrors.${code}` : 'fieldErrors.invalid')}</FieldError>}
          </Field>
        );
      }}
    />
  );
}
