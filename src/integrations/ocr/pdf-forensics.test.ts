import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { firstRevision, fontMix, inspectPdf, isEditorTool, judgePdf, pdfDate, type PdfStructure } from './pdf-forensics';

/** A small PDF written here: objects in order (1: catalog, 2: pages, 3: page…), then an xref, a trailer and %%EOF. */
function pdf(objects: string[], trailer = '', header = '%PDF-1.7\n'): string {
  let out = header;
  const offsets = objects.map((body, index) => {
    const offset = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer}>>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** An incremental update: the objects given (by number) appended with their own xref and trailer pointing back. */
function update(base: string, objects: Record<number, string>, size: number): string {
  let out = base;
  const offsets: Record<number, number> = {};
  for (const [number, body] of Object.entries(objects)) {
    offsets[Number(number)] = out.length;
    out += `${number} 0 obj\n${body}\nendobj\n`;
  }
  const prev = Number(base.match(/startxref\n(\d+)/g)!.at(-1)!.split('\n')[1]);
  const xref = out.length;
  out += `xref\n${Object.keys(offsets).map((number) => `${number} 1\n${String(offsets[Number(number)]).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${size} /Root 1 0 R /Prev ${prev} >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const bytes = (text: string) => Buffer.from(text, 'latin1');
const content = (line: string) => {
  const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
};
const page = (contents: number, extra = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R ${extra}>>`;
const BASE = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', page(4), content('Statement date 10/31/2026')];
const info = (fields: string) => `<< ${fields} >>`;

const clean: PdfStructure = { revisions: 1, linearized: false, signed: false, encrypted: false, javascript: false, acroForm: false, formFields: false, annotationKinds: [], embeddedFiles: false };

describe('dates in a PDF', () => {
  it('reads PDF and XMP dates with their offsets, as UTC', () => {
    expect(pdfDate("D:20261028153000-04'00'")).toBe('2026-10-28T19:30:00.000Z');
    expect(pdfDate('D:20261028153000Z')).toBe('2026-10-28T15:30:00.000Z');
    expect(pdfDate('D:2026102815')).toBe('2026-10-28T15:00:00.000Z');
    expect(pdfDate('2026-10-28T15:30:00+02:00')).toBe('2026-10-28T13:30:00.000Z');
    expect(pdfDate('2026-10-28')).toBe('2026-10-28T00:00:00.000Z');
    expect(pdfDate('D:20261328000000Z')).toBeUndefined();
    expect(pdfDate('yesterday')).toBeUndefined();
    expect(pdfDate(undefined)).toBeUndefined();
  });
});

describe('the markers of a PDF', () => {
  it('reads a clean statement: one revision, its producer and dates, nothing laid over it', () => {
    const file = pdf([...BASE, info("/Producer (iText 7.2.5 \\(c\\) Apryse) /Creator (Statements) /CreationDate (D:20261031120000Z) /ModDate (D:20261031120000Z)")], '/Info 5 0 R ');
    const structure = inspectPdf(bytes(file));
    expect(structure).toMatchObject({ revisions: 1, linearized: false, signed: false, encrypted: false, producer: 'iText 7.2.5 (c) Apryse', creator: 'Statements', created: '2026-10-31T12:00:00.000Z', modified: '2026-10-31T12:00:00.000Z', javascript: false, formFields: false, annotationKinds: [] });
    expect(judgePdf(structure)).toEqual({ findings: [], unedited: 'pass' });
  });

  it('counts revisions, but not a linearized first section or a signature', () => {
    const file = pdf(BASE);
    const updated = update(file, { 4: content('Statement date 11/30/2026') }, 5);
    expect(inspectPdf(bytes(updated)).revisions).toBe(2);
    const linearized = pdf([...BASE], '', '%PDF-1.7\n1 0 obj << /Linearized 1 /L 1000 >> endobj\n');
    expect(inspectPdf(bytes(update(linearized, { 4: content('x') }, 5))).revisions).toBe(1);
    const signed = update(file, { 5: '<< /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 10 20 30] /Contents <00> >>' }, 6);
    expect(inspectPdf(bytes(signed))).toMatchObject({ revisions: 1, signed: true });
  });

  it('cuts out the first revision to compare with the last', () => {
    const file = pdf(BASE);
    const updated = update(file, { 4: content('Statement date 11/30/2026') }, 5);
    expect(firstRevision(bytes(updated), inspectPdf(bytes(updated)))!.toString('latin1')).toBe(file);
    expect(firstRevision(bytes(file), inspectPdf(bytes(file)))).toBeNull();
  });

  it('finds markers hidden in names spelled with #xx escapes, and active content', () => {
    expect(inspectPdf(bytes(pdf([...BASE.slice(0, 3), content('x'), '<< /Type /Action /S /J#61vaScript >>']))).javascript).toBe(true);
    expect(inspectPdf(bytes(pdf([...BASE.slice(0, 3), content('x'), '<< /Type /Action /S /Named /N /NextPage >>']))).javascript).toBe(false);
    expect(inspectPdf(bytes(pdf([...BASE, '<< /Type /RichMedia >>']))).javascript).toBe(true);
    expect(inspectPdf(bytes(pdf([...BASE, '<< /S /Launch /F (calc.exe) >>']))).javascript).toBe(true);
    expect(inspectPdf(bytes(pdf([...BASE, '<< /OpenAction [3 0 R /Fit] >>']))).javascript).toBe(false);
  });

  it('tells annotations laid over text from links, and fillable fields from a signature field', () => {
    const boxed = inspectPdf(bytes(pdf([BASE[0]!, BASE[1]!, page(4, '/Annots [5 0 R 6 0 R]'), BASE[3]!, '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] >>', '<< /Type /Annot /Subtype /FreeText /Rect [0 0 10 10] /Contents (78723) >>'])));
    expect(boxed.annotationKinds).toEqual(['FreeText', 'Link']);
    expect(judgePdf(boxed)).toEqual({ findings: ['pdf_annotations'], unedited: 'fail' });
    const linked = inspectPdf(bytes(pdf([BASE[0]!, BASE[1]!, page(4, '/Annots [5 0 R]'), BASE[3]!, '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] >>'])));
    expect(judgePdf(linked)).toEqual({ findings: [], unedited: 'pass' });
    const fillable = inspectPdf(bytes(pdf([...BASE, '<< /Fields [6 0 R] >>', '<< /FT /Tx /T (name) /Subtype /Widget >>'], '/AcroForm 5 0 R ')));
    expect(fillable).toMatchObject({ acroForm: true, formFields: true });
    expect(judgePdf(fillable).findings).toContain('pdf_form_fields');
    const signedOnly = inspectPdf(bytes(pdf([...BASE, '<< /Fields [6 0 R] /SigFlags 3 >>', '<< /FT /Sig /T (sig) /Subtype /Widget >>'], '/AcroForm 5 0 R ')));
    expect(signedOnly.formFields).toBe(false);
    expect(judgePdf(signedOnly).findings).not.toContain('pdf_form_fields');
  });

  it('reads the producer from a compressed object stream and decodes UTF-16 strings', () => {
    const dict = '<< /Producer <FEFF0069004C006F007600650050004400460020> /ModDate (D:20261102000000Z) >>';
    const header = '5 0 ';
    const stream = deflateSync(Buffer.from(`${header}${dict}`, 'latin1'));
    const file = `${pdf(BASE).replace(/%%EOF\n$/, '')}`;
    const withStream = `${file.replace(/xref[\s\S]*$/, '')}6 0 obj\n<< /Type /ObjStm /N 1 /First ${header.length} /Filter /FlateDecode /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream\nendobj\n${file.slice(file.indexOf('xref'))}%%EOF\n`;
    const structure = inspectPdf(bytes(withStream));
    expect(structure.producer).toBe('iLovePDF');
    expect(structure.modified).toBe('2026-11-02T00:00:00.000Z');
    expect(judgePdf(structure).findings).toContain('pdf_editor_tool');
  });

  it('reads XMP metadata', () => {
    const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description pdf:Producer="Sejda Desktop 7" xmp:CreateDate="2026-10-01T10:00:00Z"/></x:xmpmeta>';
    const file = pdf([...BASE, `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`]);
    expect(inspectPdf(bytes(file))).toMatchObject({ producer: 'Sejda Desktop 7', created: '2026-10-01T10:00:00.000Z' });
  });
});

describe('editors and what they leave behind', () => {
  it('knows the tools that edit PDFs, and not the ones that make or print them', () => {
    for (const name of ['iLovePDF', 'Smallpdf.com', 'Sejda Desktop', 'PDFescape Online', 'PDF24 Creator', 'Xodo', 'PDF-XChange Editor 9.5', 'PDF-XChange Core API SDK', 'Foxit PhantomPDF', 'Foxit PDF Editor', 'Nitro Pro', 'Wondershare PDFelement', 'pdfFiller', 'DocHub', 'Canva', 'Adobe Photoshop 25.0', 'GIMP 2.10', 'Adobe Acrobat Pro DC 23.8', 'Acrobat Standard 2020', 'iText 5.5.13; modified using iText® 7.1.6', 'Adobe Acrobat Pro (64-bit) Paper Capture Plug-in', 'CorelDRAW 2024']) {
      expect(isEditorTool(name), name).toBe(true);
    }
    for (const name of ['iText® 7.2.5 ©2000-2023 Apryse Group NV', 'Acrobat Distiller 23.0 (Windows)', 'Adobe PDF Library 17.11.238', 'Microsoft: Print To PDF', 'Skia/PDF m120', 'macOS Version 14.1 (Build 23B74) Quartz PDFContext', 'OpenText Output Transformation Engine', 'TargetStream StreamEDS', 'Ricoh Americas Corporation, AFP2PDF', 'Crystal Reports', 'Microsoft® Word for Microsoft 365', 'GPL Ghostscript 10.02.1', undefined]) {
      expect(isEditorTool(name), String(name)).toBe(false);
    }
  });

  it('weighs a revision by what it changed: text (strong), nothing (benign) or unknown (weak)', () => {
    const twice = { ...clean, revisions: 2 };
    expect(judgePdf(twice, { revisionTextChanged: true })).toEqual({ findings: ['pdf_incremental_updates'], unedited: 'fail' });
    expect(judgePdf(twice, { revisionTextChanged: false })).toEqual({ findings: [], unedited: 'pass' });
    expect(judgePdf(twice, { revisionTextChanged: null })).toEqual({ findings: ['pdf_incremental_updates'], unedited: 'unsure' });
    expect(judgePdf(twice)).toEqual({ findings: ['pdf_incremental_updates'], unedited: 'unsure' });
  });

  it('flags text drawn over other text, a late modification, and a file older than the date it states', () => {
    expect(judgePdf(clean, { overlaps: 2 })).toEqual({ findings: ['pdf_text_overlay'], unedited: 'fail' });
    expect(judgePdf(clean, { created: 'D:20261001000000Z', modified: 'D:20261015000000Z' })).toEqual({ findings: ['pdf_edited_after_creation'], unedited: 'unsure' });
    expect(judgePdf(clean, { created: 'D:20261001000000Z', modified: 'D:20261001180000Z' })).toEqual({ findings: [], unedited: 'pass' });
    expect(judgePdf(clean, { created: 'D:20260715000000Z' }, '2026-10-31')).toEqual({ findings: ['pdf_created_before_statement'], unedited: 'fail' });
    expect(judgePdf(clean, { created: 'D:20261031080000Z' }, '2026-10-31')).toEqual({ findings: [], unedited: 'pass' });
    expect(judgePdf(clean, { producer: 'Microsoft: Print To PDF' })).toEqual({ findings: [], unedited: 'pass' });
  });

  it('notes a font that draws only a number or two on a page set in other fonts, without failing it', () => {
    expect(fontMix([{ runs: 40, digitRuns: 10 }, { runs: 12, digitRuns: 3 }, { runs: 1, digitRuns: 1 }])).toBe(true);
    expect(fontMix([{ runs: 40, digitRuns: 10 }, { runs: 12, digitRuns: 3 }, { runs: 2, digitRuns: 0 }])).toBe(false);
    expect(fontMix([{ runs: 40, digitRuns: 10 }, { runs: 1, digitRuns: 1 }])).toBe(false);
    expect(judgePdf(clean, { fonts: [{ runs: 40, digitRuns: 10 }, { runs: 12, digitRuns: 3 }, { runs: 1, digitRuns: 1 }] })).toEqual({ findings: ['pdf_font_mix'], unedited: 'pass' });
  });
});
