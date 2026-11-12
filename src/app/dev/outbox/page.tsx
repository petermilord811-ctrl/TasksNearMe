import { desc, eq } from 'drizzle-orm';
import { Suspense } from 'react';
import { db } from '@/platform/db/client';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

export const metadata = { title: 'Dev outbox' };

/** Development only: emails and SMS "sent" by the fake providers. `?to=` shows one recipient's. */
export default function DevOutboxPage({ searchParams }: { searchParams: Promise<{ to?: string | string[] }> }) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Dev outbox</h1>
      <Suspense fallback={<p>Loading messages…</p>}>
        <Messages searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Messages({ searchParams }: { searchParams: Promise<{ to?: string | string[] }> }) {
  const { to } = await searchParams;
  const recipient = typeof to === 'string' && to.trim() ? to.trim().toLowerCase() : undefined;
  const rows = await db
    .select()
    .from(devOutboxMessages)
    .where(recipient ? eq(devOutboxMessages.to, recipient) : undefined)
    .orderBy(desc(devOutboxMessages.createdAt))
    .limit(50);
  if (rows.length === 0) return <p>No messages yet.</p>;
  return (
    <ol style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      {rows.map((m) => (
        <li
          key={m.id}
          data-testid="outbox-message"
          data-channel={m.channel}
          data-to={m.to}
          style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}
        >
          <div>
            <strong>{m.channel.toUpperCase()}</strong> to {m.to} · {m.createdAt}
          </div>
          {m.subject ? <div>{m.subject}</div> : null}
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{m.body}</pre>
        </li>
      ))}
    </ol>
  );
}
