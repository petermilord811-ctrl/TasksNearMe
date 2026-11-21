/** What one OCR pass returns, trimmed to what the readers use (Tesseract's own result is much larger). */

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  /** 0–100, Tesseract's own. */
  confidence: number;
  box: OcrBox;
}

export interface OcrLine {
  words: OcrWord[];
  confidence: number;
  box: OcrBox;
}

export interface OcrPage {
  /** The mean word confidence, 0–100. */
  confidence: number;
  lines: OcrLine[];
}

export const lineText = (line: Pick<OcrLine, 'words'>): string => line.words.map((word) => word.text).join(' ');
