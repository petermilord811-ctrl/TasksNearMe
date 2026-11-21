import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stream, type Stage } from '../../scripts/backup/lib/tools';

const node = (name: string, script: string, okExit?: number[]): Stage => ({ name, cmd: process.execPath, args: ['-e', script], okExit });
const sha256 = (data: string) => createHash('sha256').update(data).digest('hex');

describe('streaming one command into another', () => {
  it('hashes and counts what passes', async () => {
    const data = 'x'.repeat(300_000);
    const result = await stream(node('source', `process.stdout.write('x'.repeat(300000))`), node('sink', 'process.stdin.resume()'));
    expect(result.bytes).toBe(data.length);
    expect(result.sha256).toBe(sha256(data));
  });

  it('collects a buffer through a command', async () => {
    const result = await stream(Buffer.from('hello'), node('upper', `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s.toUpperCase()))`));
    expect(result.sha256).toBe(sha256('hello'));
    const collected = await stream(node('echo', `process.stdout.write('abc')`), 'collect');
    expect(collected.output.toString()).toBe('abc');
  });

  it("reports the failing command's own error, not the broken pipe it caused", async () => {
    await expect(stream(node('source', `process.stdout.write('x'.repeat(5000000))`), node('pg_restore', `process.stderr.write('pg_restore: error: bad archive');process.exit(1)`))).rejects.toThrow(
      /pg_restore failed \(exit 1\): pg_restore: error: bad archive/,
    );
    await expect(stream(node('pg_dump', `process.stderr.write('connection refused');process.exit(2)`), 'discard')).rejects.toThrow(/pg_dump failed \(exit 2\): connection refused/);
  });

  it('accepts the exit codes a stage allows', async () => {
    await expect(stream(node('tar', `process.stdout.write('ok');process.exit(1)`, [1]), 'discard')).resolves.toMatchObject({ bytes: 2 });
  });
});
