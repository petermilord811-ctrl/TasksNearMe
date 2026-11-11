// Owned by Codex (UI). Initial version created by Claude from docs/ui/design-system.md §2.2.
// The root layout applies `fontVariables` to <html>; CSS uses var(--font-sans) and var(--font-heading).
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

export const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const fontHeading = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

export const fontVariables = `${fontSans.variable} ${fontHeading.variable}`;
