import { desc, eq } from 'drizzle-orm';
import { Suspense } from 'react';
import { db } from '@/platform/db/client';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

export const metadata = { title: 'Dev outbox' };

/**
 * Development only: emails and SMS "sent" by the fake providers. `?to=` shows one recipient's. An email with
 * a designed version shows it in a frame (links open in a new tab), with a link to open it full size.
 */
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
          data-tag={m.tag ?? ''}
          style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}
        >
          <div>
            <strong>{m.channel.toUpperCase()}</strong> to {m.to} · {m.createdAt}
            {m.tag ? <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 999, background: '#f1ebe3', fontSize: 12 }}>{m.tag}</span> : null}
          </div>
          {m.subject ? <div>{m.subject}</div> : null}
          {m.html ? (
            <details open={m.tag === 'welcome'} style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer' }}>
                Designed version · <a href={`/dev/outbox/${m.id}`} target="_blank" rel="noreferrer">open full size</a>
              </summary>
              <iframe
                title={`Designed version of "${m.subject}"`}
                srcDoc={m.html}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                style={{ display: 'block', width: '100%', height: 760, marginTop: 8, border: '1px solid #ddd', borderRadius: 8, background: '#fbf7f2' }}
              />
            </details>
          ) : null}
          <details open={!m.html} style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer' }}>Plain text</summary>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{m.body}</pre>
          </details>
        </li>
      ))}
    </ol>
  );
}
