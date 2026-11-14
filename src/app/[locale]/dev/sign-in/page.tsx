import { asc, eq } from 'drizzle-orm';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { staffRoles, users } from '@/modules/accounts/schema';
import { devSignInAs } from '@/platform/auth/dev-sign-in';
import { db } from '@/platform/db/client';

export const metadata = { title: 'Dev sign-in' };

/** Development only (the /dev layout 404s in production). */
export default function DevSignInPage() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Sign in as a sample person</h1>
      <p>Uses the real email-code flow; the code is read from the dev outbox.</p>
      {/* Any account by its email (what the e2e helper uses: the list below grows with every test run). Staff land
          on the two-step check, everyone else on the app home. Works before the page hydrates. */}
      <form action={devSignInAs} aria-label="Sign in by email" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginTop: 16 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          Email
          <input name="email" type="email" required autoComplete="off" style={{ minHeight: 44, padding: '0 8px' }} />
        </label>
        <button type="submit" style={{ minHeight: 44, padding: '0 16px' }}>
          Sign in
        </button>
      </form>
      <Suspense fallback={<p>Loading people…</p>}>
        <People />
      </Suspense>
    </main>
  );
}

async function People() {
  const rows = await db
    .select({ email: users.email, name: users.name, mode: users.mode, role: staffRoles.role })
    .from(users)
    .leftJoin(staffRoles, eq(staffRoles.userId, users.id))
    .orderBy(asc(users.email));

  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, marginTop: 16 }}>
      {rows.map((row) => (
        <li key={`${row.email}-${row.role ?? 'member'}`}>
          <form action={devSignInAs} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="hidden" name="email" value={row.email} />
            <input type="hidden" name="target" value={row.role ? routes.admin.verify() : routes.app.home()} />
            <button type="submit" style={{ minHeight: 44, padding: '0 16px' }}>
              Sign in as {row.name || row.email}
            </button>
            <span>
              {row.email} · {row.role ?? `member (${row.mode})`}
            </span>
          </form>
        </li>
      ))}
    </ul>
  );
}
