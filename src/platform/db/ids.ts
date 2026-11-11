import { randomUUID } from 'node:crypto';

/** Readable, unique text ids with a type prefix, e.g. newId('tsk') → "tsk_3f2a…". */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}
