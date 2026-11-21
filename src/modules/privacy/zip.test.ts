import { describe, expect, it } from 'vitest';
import { readZip, zipFiles } from './zip';

describe('the data copy as a zip (privacy rehearsal J-PR10)', () => {
  it('holds each file as it was: the text deflated, photos stored, names in UTF-8', () => {
    const json = Buffer.from(JSON.stringify({ about: 'Todo lo vinculado a tu cuenta', items: Array.from({ length: 200 }, (_, i) => ({ i })) }));
    const photo = Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 37) % 256));
    const zip = zipFiles([{ name: 'tasksnearme-data-2026-11-21.json', body: json, compress: true }, { name: 'photos/tasks/año.jpg', body: photo }], new Date('2026-11-21T15:04:06.000Z'));
    const back = readZip(zip);
    expect([...back.keys()]).toEqual(['tasksnearme-data-2026-11-21.json', 'photos/tasks/año.jpg']);
    expect(back.get('tasksnearme-data-2026-11-21.json')?.equals(json)).toBe(true);
    expect(back.get('photos/tasks/año.jpg')?.equals(photo)).toBe(true);
    // The text shrank; the zip ends with its directory.
    expect(zip.length).toBeLessThan(json.length + photo.length);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it('refuses an entry whose contents changed', () => {
    const zip = zipFiles([{ name: 'a.txt', body: Buffer.from('hello') }], new Date());
    zip[30 + 'a.txt'.length] ^= 0xff;
    expect(() => readZip(zip)).toThrow('bad CRC');
  });
});
