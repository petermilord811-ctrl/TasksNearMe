/**
 * A native <select> styled like the Input primitive (src/ui/primitives/input.tsx): rounded, a soft inner shadow, a
 * hover edge and a focus halo, light and dark. The list it opens is the app's own (select-menus.css: the browser's
 * styled list where it can, a listbox in the same look elsewhere for a mouse; touch screens there keep the platform's
 * picker); the select itself stays native for forms, the keyboard and screen readers.
 */
export const nativeSelectClassName =
  'min-h-11 w-full min-w-0 cursor-pointer rounded-xl border border-input bg-card px-3.5 text-base shadow-[inset_0_1px_2px_rgb(23_18_14/0.05)] outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.035] dark:shadow-none dark:hover:border-foreground/50 dark:aria-invalid:ring-destructive/40';
