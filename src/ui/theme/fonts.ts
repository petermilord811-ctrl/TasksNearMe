// The root layout applies these variables; next/font self-hosts every family.
import { Bricolage_Grotesque, DM_Sans, Instrument_Serif } from 'next/font/google';

/** Body text everywhere: calm and very legible. */
export const fontSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

/** Display and headings: a characterful variable grotesque (weight, width and optical size). */
export const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-bricolage',
  display: 'swap',
});

/** An italic serif for a word or two of emphasis on the public pages (not preloaded). */
export const fontAccent = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
  preload: false,
});

export const fontVariables = `${fontSans.variable} ${fontDisplay.variable} ${fontAccent.variable}`;
