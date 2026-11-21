import type { IdDocumentReading } from '@/integrations/ai/id-document-reader';
import type { IdBarcodeDetails } from './aamva';
import { digitsOnly, sameWord, words } from './text';

/**
 * The back of a US license or state ID card, as the ID reader uses it: the barcode's fields as the reading (exact:
 * PDF417's error correction decodes every byte or nothing), and whether the front printed the same person and card.
 * Pure functions, no I/O.
 */

/** A suffix the front may print after the family name. */
const SUFFIX = /^(?:JR|SR|II|III|IV|V)$/;

/** The same family name, allowing for OCR's slips on the front (`sameWord`) and a suffix printed after it there. */
function sameSurname(barcode: string, front: string): boolean {
  const expected = words(barcode);
  let read = words(front);
  if (read.length === expected.length + 1 && SUFFIX.test(read.at(-1)!)) read = read.slice(0, -1);
  return expected.length > 0 && read.length === expected.length && expected.every((word, index) => sameWord(word, read[index]!));
}

/** A number without its spaces and dashes, with the letters OCR reads for digits as digits (on both sides alike). */
const numberKey = (value: string) => digitsOnly(value.toUpperCase().replace(/[^A-Z0-9]/g, ''));

/**
 * Whether the front agrees with the barcode: the same family name, birth date and number (the number when the front's
 * was read; the name and birth date always are when it reads). Undefined when the front didn't read.
 */
export function frontAgrees(barcode: IdBarcodeDetails, front: IdDocumentReading): boolean | undefined {
  if (!front.readable || !front.surname || !front.dateOfBirth) return undefined;
  if (!sameSurname(barcode.surname, front.surname) || barcode.dateOfBirth !== front.dateOfBirth) return false;
  return front.documentNumber === undefined || numberKey(barcode.documentNumber) === numberKey(front.documentNumber);
}

/**
 * The reading the barcode gives: every field from it, the address too (read, never stored), the given and middle
 * names together as a card's field 2 prints them, and whether the front agrees (left out when the front didn't read).
 */
export function barcodeReading(barcode: IdBarcodeDetails, front: IdDocumentReading): IdDocumentReading {
  const agrees = frontAgrees(barcode, front);
  return {
    readable: true,
    source: 'barcode',
    documentType: barcode.documentType,
    givenNames: [barcode.givenNames, barcode.middleNames].filter(Boolean).join(' '),
    surname: barcode.surname,
    dateOfBirth: barcode.dateOfBirth,
    expiryDate: barcode.expiryDate,
    issuingState: barcode.issuingState,
    documentNumber: barcode.documentNumber,
    ...(barcode.address ? { address: barcode.address } : {}),
    ...(agrees !== undefined ? { frontAgrees: agrees } : {}),
  };
}
