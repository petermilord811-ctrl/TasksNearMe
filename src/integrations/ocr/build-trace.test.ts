import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The readers run in a process of their own that loads its modules at run time, out of the bundler's sight, so the
 * standalone build only has the files next.config.ts names (outputFileTracingIncludes). 2026-11-27: production lacked
 * the Tesseract core that tesseract.js actually loads, and every OCR pass failed there while development worked.
 */

const root = path.resolve(__dirname, '../../..');
const config = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8');

/** A glob from the include list as a regular expression (`*`, `**` and `{a,b}` are all the list uses). */
function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === '*' && glob[i + 1] === '*') {
      pattern += '.*';
      i++;
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '{') {
      const end = glob.indexOf('}', i);
      pattern += `(?:${glob.slice(i + 1, end).split(',').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

const includes = [...config.matchAll(/'(\.\/(?:node_modules|vendor)\/[^']+)'/g)].map((match) => globToRegExp(match[1]!));
const traced = (file: string) => includes.some((pattern) => pattern.test(`./${file}`));

describe("the readers' files in the standalone build", () => {
  it('keeps every Tesseract core build (tesseract.js loads a non-LSTM one whatever the engine mode)', () => {
    const cores = fs.readdirSync(path.join(root, 'node_modules/tesseract.js-core')).filter((name) => /^tesseract-core.*\.(js|wasm)$/.test(name));
    expect(cores.length).toBeGreaterThanOrEqual(6);
    for (const name of cores) expect(traced(`node_modules/tesseract.js-core/${name}`), name).toBe(true);
  });

  it('keeps the English data, the barcode reader, the PDF reader, OpenCV and the face models', () => {
    for (const file of [
      'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
      'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
      'node_modules/unpdf/package.json',
      'node_modules/@techstark/opencv-js/dist/opencv.js',
      'vendor/face-models/yunet.onnx',
      'vendor/face-models/sface-int8.onnx',
    ]) {
      expect(fs.existsSync(path.join(root, file)), `${file} exists`).toBe(true);
      expect(traced(file), file).toBe(true);
    }
  });
});
