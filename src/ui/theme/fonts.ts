// The root layout applies these variables; next/font self-hosts both families.
import { DM_Sans, Newsreader } from 'next/font/google';

export const fontSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const fontHeading = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const fontVariables = `${fontSans.variable} ${fontHeading.variable}`;
