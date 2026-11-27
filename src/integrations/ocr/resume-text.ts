import { inflateRawSync } from 'node:zlib';
import { RESUME_RULES } from '@/contracts';
import { AiUnavailableError } from '@/integrations/ai/writer';
import { EngineFailureError, OverBudgetError, UnreadableDocumentError, withReadSession } from './engine';

/**
 * A resume's text, for "Import from resume" (owner, 2026-11-27): a PDF's own text (read by PDF.js in the reader's
 * process, as proofs are, never in the server's), a Word document's paragraphs, or plain text. The file and its text
 * are never stored or logged; the caller keeps the text only for one reading. Null when there's no text to read: a
 * scanned resume (a PDF without text), a broken or locked file, or a document too big to unpack.
 */

export type ResumeFileKind = 'pdf' | 'docx' | 'txt';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The kind of file, by its type or, when a phone sends none (or a generic one), by its name. */
export function resumeFileKind(file: { name: string; type: string }): ResumeFileKind | null {
  const type = file.type.toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type === DOCX_TYPE) return 'docx';
  if (type === 'text/plain') return 'txt';
  if (type && type !== 'application/octet-stream' && type !== 'application/zip') return null;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.txt')) return 'txt';
  return null;
}

/** A Word document's limits: entries in its ZIP, and the size its text part may unpack to. */
const DOCX_LIMITS = { entries: 2_000, documentBytes: 5 * 1024 * 1024 } as const;
const PDF_LIMITS = { maxPages: 15, readPages: 5 } as const;
/** The text a reading keeps (several pages of resume; the rest isn't read). */
export const RESUME_TEXT_MAX = 40_000;

/**
 * `word/document.xml` from a .docx, unpacked with node's zlib within the limits (a "zip bomb" or a file with thousands
 * of entries is refused): a ZIP's central directory names each entry with where its data starts and how it's stored.
 * Null when it isn't a Word document or won't unpack; ZIP64 files (over 4 GB) aren't resumes.
 */
function docxDocumentXml(bytes: Buffer): Buffer | null {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return null;
  // The end of central directory record: within the last 64 KB (its comment), signature 0x06054b50.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const entries = bytes.readUInt16LE(end + 10);
  const directory = bytes.readUInt32LE(end + 16);
  if (entries > DOCX_LIMITS.entries || directory >= bytes.length) return null;
  let at = directory;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) return null;
    const method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;
    if (name !== 'word/document.xml') continue;
    if (compressed === 0xffffffff || size === 0xffffffff || size > DOCX_LIMITS.documentBytes) return null;
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + compressed);
    if (data.length !== compressed) return null;
    try {
      if (method === 0) return data.length <= DOCX_LIMITS.documentBytes ? data : null;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: DOCX_LIMITS.documentBytes });
    } catch {
      // Over the limit, or not deflate data after all.
    }
    return null;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** A Word document's XML as text: a line per paragraph, its tabs and line breaks kept, every tag dropped. */
export function wordXmlText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A .docx file's text, or null when it isn't one or won't unpack within the limits. */
export function docxText(bytes: Buffer): string | null {
  const xml = docxDocumentXml(bytes);
  return xml ? wordXmlText(xml.toString('utf8')) : null;
}

/** Plain text as UTF-8 (a byte order mark dropped), or null for a file that isn't text. */
export function plainText(bytes: Buffer): string | null {
  const text = bytes.toString('utf8').replace(/^﻿/, '');
  // Text has no NUL bytes; a binary file sent as .txt does.
  return text.includes('\u0000') ? null : text;
}

/**
 * The text of a resume file, at most `RESUME_TEXT_MAX` characters. Null when there's none to read. Throws
 * `AiUnavailableError` when the reader's process fails (not the file's fault).
 */
export async function resumeText(file: { bytes: Buffer; kind: ResumeFileKind }): Promise<string | null> {
  if (file.bytes.length === 0 || file.bytes.length > RESUME_RULES.maxMegabytes * 1024 * 1024) return null;
  let text: string | null;
  if (file.kind === 'txt') text = plainText(file.bytes);
  else if (file.kind === 'docx') text = docxText(file.bytes);
  else {
    if (file.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
    try {
      text = (await withReadSession((session) => session.pdfText(file.bytes, PDF_LIMITS))).text;
    } catch (error) {
      if (error instanceof OverBudgetError || error instanceof UnreadableDocumentError) return null;
      if (error instanceof EngineFailureError) throw new AiUnavailableError(error.message, { cause: error });
      throw error;
    }
  }
  return text === null ? null : text.slice(0, RESUME_TEXT_MAX);
}
