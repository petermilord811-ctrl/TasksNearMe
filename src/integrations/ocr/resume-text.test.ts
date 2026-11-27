import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { docxText, plainText, resumeFileKind, resumeText, wordXmlText } from './resume-text';

/** A ZIP written here (deflated or stored entries; the reader ignores CRCs), as Word saves a .docx. */
function zip(entries: Array<{ name: string; data: Buffer; store?: boolean; declaredSize?: number }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = entry.store ? entry.data : deflateRawSync(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.store ? 0 : 8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.declaredSize ?? entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.store ? 0 : 8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.declaredSize ?? entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const document = (body: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`, 'utf8');

describe("a resume file's kind", () => {
  it('goes by its type, or by its name when a phone sends none or a generic one', () => {
    expect(resumeFileKind({ name: 'cv.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(resumeFileKind({ name: 'cv', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe('docx');
    expect(resumeFileKind({ name: 'cv.txt', type: 'text/plain' })).toBe('txt');
    expect(resumeFileKind({ name: 'Resume.DOCX', type: '' })).toBe('docx');
    expect(resumeFileKind({ name: 'resume.pdf', type: 'application/octet-stream' })).toBe('pdf');
    expect(resumeFileKind({ name: 'resume.doc', type: 'application/msword' })).toBeNull();
    expect(resumeFileKind({ name: 'photo.jpg', type: 'image/jpeg' })).toBeNull();
    expect(resumeFileKind({ name: 'resume.pages', type: '' })).toBeNull();
  });
});

describe("a Word document's text", () => {
  it('keeps paragraphs, tabs and line breaks, and decodes entities', () => {
    expect(wordXmlText(`${paragraph('Sam Kim')}<w:p><w:r><w:t>Mover</w:t><w:tab/><w:t>2019 &amp; 2022</w:t><w:br/><w:t>Packing &lt;fragile&gt; &#233;l&#xE9;</w:t></w:r></w:p>`)).toBe('Sam Kim\nMover\t2019 & 2022\nPacking <fragile> élé');
  });

  it('reads word/document.xml from a .docx, deflated or stored', () => {
    const body = document(`${paragraph('Experience')}${paragraph('Furniture assembler, Hyde Park Home Goods, 2022 to present')}`);
    const files = [{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }, { name: 'word/document.xml', data: body }];
    expect(docxText(zip(files))).toBe('Experience\nFurniture assembler, Hyde Park Home Goods, 2022 to present');
    expect(docxText(zip(files.map((file) => ({ ...file, store: true }))))).toBe('Experience\nFurniture assembler, Hyde Park Home Goods, 2022 to present');
  });

  it("refuses what isn't a Word document or unpacks too big", () => {
    expect(docxText(Buffer.from('not a zip at all, just text'))).toBeNull();
    expect(docxText(zip([{ name: 'word/other.xml', data: Buffer.from('<x/>') }]))).toBeNull();
    // Declared over 5 MB.
    expect(docxText(zip([{ name: 'word/document.xml', data: document(paragraph('x')), declaredSize: 6 * 1024 * 1024 }]))).toBeNull();
    // Declared small, but inflates past 5 MB (a "zip bomb").
    expect(docxText(zip([{ name: 'word/document.xml', data: Buffer.alloc(6 * 1024 * 1024, 0x41), declaredSize: 1000 }]))).toBeNull();
    // Thousands of entries.
    expect(docxText(zip(Array.from({ length: 2_001 }, (_, index) => ({ name: `f${index}`, data: Buffer.from('x'), store: true }))))).toBeNull();
  });
});

describe('plain text and the resume reading', () => {
  it('reads UTF-8 without its byte order mark, and refuses binary data', () => {
    expect(plainText(Buffer.from('﻿Sam Kim\nMover'))).toBe('Sam Kim\nMover');
    expect(plainText(Buffer.from([0x50, 0x00, 0x4b]))).toBeNull();
  });

  it('reads each kind, and says there is no text for an empty or fake file', async () => {
    await expect(resumeText({ bytes: Buffer.from('Mover at Two Brothers Moving'), kind: 'txt' })).resolves.toBe('Mover at Two Brothers Moving');
    await expect(resumeText({ bytes: zip([{ name: 'word/document.xml', data: document(paragraph('Mover')) }]), kind: 'docx' })).resolves.toBe('Mover');
    await expect(resumeText({ bytes: Buffer.alloc(0), kind: 'txt' })).resolves.toBeNull();
    // Not a PDF at all: never sent to the reader's process.
    await expect(resumeText({ bytes: Buffer.from('hello'), kind: 'pdf' })).resolves.toBeNull();
  });
});
