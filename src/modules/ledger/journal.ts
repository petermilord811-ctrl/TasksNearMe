import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { ledgerEntries, ledgerJournals } from './schema';

/** Ledger accounts in use (blueprint 08 names them; more arrive with the rest of B-036). */
export type LedgerAccount = 'cash:stripe_platform' | 'expense:chargeback_losses' | 'expense:processing';
export type JournalKind = 'chargeback_loss';

export interface JournalLine {
  account: LedgerAccount;
  debitCents?: number;
  creditCents?: number;
}

export interface JournalInput {
  kind: JournalKind;
  occurredAt: Date;
  paymentId?: string | null;
  bookingId?: string | null;
  providerRef?: string | null;
  memo?: string;
  /** The movement's own key (`chargeback_loss:<dispute id>`): the journal is written once. */
  idempotencyKey: string;
}

type Writer = Pick<Db, 'insert'>;

/**
 * Writes a journal once, inside the caller's transaction (with what it records). Lines that don't balance are a
 * bug, not data: they throw (and the database's deferred trigger would refuse them at commit anyway). False when
 * the journal was already written (a replayed webhook).
 */
export async function postJournal(db: Writer, input: JournalInput, lines: JournalLine[]): Promise<boolean> {
  const sides = lines.map((line) => ({ account: line.account, debitCents: line.debitCents ?? 0, creditCents: line.creditCents ?? 0 })).filter((line) => line.debitCents + line.creditCents > 0);
  const debits = sides.reduce((sum, line) => sum + line.debitCents, 0);
  const credits = sides.reduce((sum, line) => sum + line.creditCents, 0);
  const wellFormed = sides.every((line) => Number.isInteger(line.debitCents) && Number.isInteger(line.creditCents) && line.debitCents >= 0 && line.creditCents >= 0 && (line.debitCents === 0 || line.creditCents === 0));
  if (sides.length < 2 || !wellFormed || debits !== credits) throw new Error(`Ledger journal ${input.idempotencyKey} doesn't balance (debits ${debits}, credits ${credits})`);
  const id = newId('jnl');
  const [written] = await db
    .insert(ledgerJournals)
    .values({ id, kind: input.kind, occurredAt: input.occurredAt, paymentId: input.paymentId ?? null, bookingId: input.bookingId ?? null, providerRef: input.providerRef ?? null, memo: input.memo ?? '', idempotencyKey: input.idempotencyKey })
    .onConflictDoNothing({ target: ledgerJournals.idempotencyKey })
    .returning({ id: ledgerJournals.id });
  if (!written) return false;
  await db.insert(ledgerEntries).values(sides.map((line) => ({ id: newId('lge'), journalId: id, ...line })));
  return true;
}

export interface JournalView {
  id: string;
  kind: JournalKind;
  occurredAt: Date;
  memo: string;
  providerRef: string | null;
  entries: { account: string; debitCents: number; creditCents: number }[];
}

/** A booking's journals with their entries, oldest first (staff: the chargeback evidence pack). */
export async function journalsOfBooking(db: Db, bookingId: string): Promise<JournalView[]> {
  const journals = await db.select().from(ledgerJournals).where(eq(ledgerJournals.bookingId, bookingId)).orderBy(asc(ledgerJournals.occurredAt));
  if (journals.length === 0) return [];
  const entries = await db.select().from(ledgerEntries).where(inArray(ledgerEntries.journalId, journals.map((journal) => journal.id)));
  return journals.map((journal) => ({
    id: journal.id,
    kind: journal.kind as JournalKind,
    occurredAt: journal.occurredAt,
    memo: journal.memo,
    providerRef: journal.providerRef,
    entries: entries.filter((entry) => entry.journalId === journal.id).map((entry) => ({ account: entry.account, debitCents: entry.debitCents, creditCents: entry.creditCents })),
  }));
}
