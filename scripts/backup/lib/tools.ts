/**
 * Child processes for backups: pg_dump and pg_restore (through `docker exec`), gpg and tar. Data streams from one
 * process into the next and is hashed on the way, so a plaintext dump never touches the disk.
 */
import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface Stage {
  /** Shown in errors: `pg_dump`, `gpg`, `tar`. */
  name: string;
  cmd: string;
  args: string[];
  /** The terminal's stdin, for gpg to ask for a passphrase. */
  interactive?: boolean;
  /** Exit codes that still count as success (GNU tar's 1: a file changed while it was read). */
  okExit?: number[];
}

const STDERR_KEPT = 4000;

/** A command that failed. `brokenPipe`: it died writing to a process that had already gone, so that one is the cause. */
export class StageError extends Error {
  constructor(
    message: string,
    readonly brokenPipe: boolean,
  ) {
    super(message);
  }
}

function watch(child: ChildProcess, stage: Stage): Promise<void> {
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_KEPT);
  });
  return new Promise((resolve, reject) => {
    child.on('error', (error) => reject(new StageError(`${stage.name} could not start: ${error.message}`, false)));
    child.on('close', (code, signal) => {
      if (code === 0 || (code !== null && stage.okExit?.includes(code))) return resolve();
      const brokenPipe = signal === 'SIGPIPE' || /EPIPE|broken pipe/i.test(stderr);
      reject(new StageError(`${stage.name} failed (${signal ?? `exit ${code}`}): ${stderr.trim().slice(-800) || 'no error output'}`, brokenPipe));
    });
  });
}

/** Runs a command to the end and returns its stdout. */
export async function run(stage: Stage, input?: string | Buffer): Promise<string> {
  const stdio: StdioOptions = [input === undefined ? (stage.interactive ? 'inherit' : 'ignore') : 'pipe', 'pipe', 'pipe'];
  const child = spawn(stage.cmd, stage.args, { stdio });
  const done = watch(child, stage);
  const chunks: Buffer[] = [];
  child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
  if (input !== undefined) {
    child.stdin?.on('error', () => {}); // a process that exits early: its exit code says why
    child.stdin?.end(input);
  }
  await done;
  return Buffer.concat(chunks).toString('utf8');
}

export interface Streamed {
  sha256: string;
  bytes: number;
  /** What came out, when the sink was 'collect'. */
  output: Buffer;
}

/**
 * Streams a command's stdout (or a buffer) into another command's stdin, or collects or discards it, hashing the
 * bytes as they pass: a dump into gpg, gpg's plaintext into pg_restore. Fails when either command fails, with the
 * failing command's own error rather than the broken pipe it caused.
 */
export async function stream(source: Stage | Buffer, sink: Stage | 'collect' | 'discard'): Promise<Streamed> {
  const hash = createHash('sha256');
  let bytes = 0;
  const collected: Buffer[] = [];
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });

  const exits: Array<Promise<void>> = [];
  let input: Readable;
  if (Buffer.isBuffer(source)) {
    input = Readable.from([source]);
  } else {
    const child = spawn(source.cmd, source.args, { stdio: [source.interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    exits.push(watch(child, source));
    if (!child.stdout) throw new Error(`${source.name} has no output`);
    input = child.stdout;
  }

  let output: Writable;
  if (sink === 'collect' || sink === 'discard') {
    output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        if (sink === 'collect') collected.push(chunk);
        callback();
      },
    });
  } else {
    const child = spawn(sink.cmd, sink.args, { stdio: ['pipe', 'ignore', 'pipe'] });
    exits.push(watch(child, sink));
    if (!child.stdin) throw new Error(`${sink.name} takes no input`);
    output = child.stdin;
  }

  const [flow, ...ended] = await Promise.allSettled([pipeline(input, meter, output), ...exits]);
  // A real failure (the source's first) explains a broken pipe in the other command, never the other way round.
  const failures = ended
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason as unknown);
  const cause = failures.find((error) => !(error instanceof StageError && error.brokenPipe)) ?? failures[0];
  if (cause) throw cause;
  if (flow?.status === 'rejected') throw flow.reason;
  return { sha256: hash.digest('hex'), bytes, output: Buffer.concat(collected) };
}

export async function sha256File(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

/**
 * A new, private gpg home. gpg-agent puts its sockets in it, and a socket path longer than about 100 bytes makes
 * decryption fail with a misleading "Bad secret key", so it's always a short folder in /tmp, never in a work folder.
 */
export async function makeGpgHome(): Promise<string> {
  const base = os.tmpdir().length <= 40 ? os.tmpdir() : '/tmp';
  return fs.mkdtemp(path.join(base, 'tnm-gpg-'));
}

/** Stops the agent a gpg home started, and deletes the home. */
export async function removeGpgHome(home: string): Promise<void> {
  await stopGpgAgent(home);
  await fs.rm(home, { recursive: true, force: true });
}

/** gpg with its own home folder: the server's keyring and agent are never touched. */
export function gpg(home: string, args: string[], options: { interactive?: boolean } = {}): Stage {
  return { name: 'gpg', cmd: 'gpg', args: ['--homedir', home, '--no-options', '--quiet', ...args], interactive: options.interactive };
}

/** Encrypts stdin to the public key in `publicKeyFile` (no keyring needed) and writes `out`. */
export function gpgEncrypt(home: string, publicKeyFile: string, out: string): Stage {
  return gpg(home, ['--batch', '--yes', '--trust-model', 'always', '--compress-algo', 'none', '--recipient-file', publicKeyFile, '--output', out, '--encrypt']);
}

/** Decrypts `file` to stdout with a key in `home`. Without a passphrase file, gpg asks on the terminal. */
export function gpgDecrypt(home: string, file: string, passphraseFile: string | null): Stage {
  return passphraseFile
    ? gpg(home, ['--batch', '--pinentry-mode', 'loopback', '--passphrase-file', passphraseFile, '--decrypt', file])
    : gpg(home, ['--pinentry-mode', 'loopback', '--decrypt', file], { interactive: true });
}

/** Stops the gpg-agent a temporary home started. */
export async function stopGpgAgent(home: string): Promise<void> {
  await run({ name: 'gpgconf', cmd: 'gpgconf', args: ['--homedir', home, '--kill', 'gpg-agent'] }).catch(() => {});
}
