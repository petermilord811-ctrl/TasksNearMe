import { notFound } from 'next/navigation';
import { Suspense, type CSSProperties } from 'react';
import { STAND_IN_PEOPLE } from '@/integrations/oauth/stand-in-people';
import { isSocialProvider } from '@/modules/accounts/sign-in/providers';

export const metadata = { title: 'Stand-in sign-in', robots: { index: false, follow: false } };

const NAMES = { google: 'Google', microsoft: 'Microsoft' } as const;

const card: CSSProperties = { maxWidth: 460, margin: '48px auto', padding: 28, border: '1px solid #d9d9e3', borderRadius: 20, background: '#fff', color: '#1b1b1f', fontFamily: 'system-ui, sans-serif', boxShadow: '0 12px 40px -24px rgb(0 0 0 / 0.35)' };
const row: CSSProperties = { display: 'flex', width: '100%', minHeight: 56, alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #e5e5ee', borderRadius: 12, background: '#fafafe', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' };
const field: CSSProperties = { display: 'block', width: '100%', minHeight: 44, marginTop: 4, padding: '0 10px', border: '1px solid #c9c9d6', borderRadius: 10, font: 'inherit', boxSizing: 'border-box' };

/**
 * Development only (the /dev layout 404s in production): stands in for Google's or Microsoft's sign-in
 * page. Better Auth sent the browser here with its state and PKCE challenge. The forms post to ./answer,
 * which sends the browser back to Better Auth's callback with a code, or `access_denied` for Cancel.
 */
export default function StandInSignInPage({ params, searchParams }: PageProps<'/[locale]/dev/oauth/[provider]'>) {
  return (
    <main style={{ minHeight: '100vh', padding: '1px 16px', background: '#f3f2f8' }}>
      <Suspense fallback={<p style={{ textAlign: 'center' }}>Loading…</p>}>
        <Chooser params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Chooser({ params, searchParams }: Pick<PageProps<'/[locale]/dev/oauth/[provider]'>, 'params' | 'searchParams'>) {
  const { provider } = await params;
  if (!isSocialProvider(provider)) notFound();
  const query = await searchParams;
  const read = (key: string) => (typeof query[key] === 'string' ? query[key] : '');
  const name = NAMES[provider];
  const answer = `/dev/oauth/${provider}/answer`;
  const request = (
    <>
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="state" value={read('state')} />
      <input type="hidden" name="redirect_uri" value={read('redirect_uri')} />
      <input type="hidden" name="code_challenge" value={read('code_challenge')} />
    </>
  );

  return (
    <section aria-labelledby="chooser-title" style={card}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#5b5b6b' }}>{name} · stand-in</p>
      <h1 id="chooser-title" style={{ margin: '8px 0 4px', fontSize: 24 }}>Choose an account</h1>
      <p style={{ margin: 0, color: '#4a4a57' }}>to continue to TasksNearMe. This page stands in for {name}&apos;s sign-in in development and tests.</p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 8 }}>
        {STAND_IN_PEOPLE.filter((person) => person.provider === provider).map((person) => (
          <li key={person.key}>
            <form method="post" action={answer}>
              {request}
              <input type="hidden" name="answer" value="approve" />
              <input type="hidden" name="person" value={person.key} />
              <button type="submit" style={row}>
                <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: '#e8e4ff', fontWeight: 700 }}>{person.label.charAt(0)}</span>
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{person.label}</span>
                  <span style={{ display: 'block', fontSize: 13, color: '#4a4a57' }}>{person.email}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6a6a78' }}>{person.note}</span>
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form method="post" action={answer} aria-labelledby="someone-else" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e5ee', display: 'grid', gap: 10 }}>
        {request}
        <input type="hidden" name="answer" value="approve" />
        <input type="hidden" name="person" value="custom" />
        <h2 id="someone-else" style={{ margin: 0, fontSize: 16 }}>Someone else</h2>
        <label style={{ fontSize: 14 }}>
          Full name
          <input name="name" required autoComplete="off" style={field} />
        </label>
        <label style={{ fontSize: 14 }}>
          Email
          <input name="email" type="email" required autoComplete="off" style={field} />
        </label>
        {provider === 'microsoft' && (
          <label style={{ fontSize: 14 }}>
            Account
            <select name="kind" defaultValue="personal" style={field}>
              <option value="personal">Personal (Outlook.com, Hotmail, Live)</option>
              <option value="work_verified">Work or school, domain verified</option>
              <option value="work_unverified">Work or school, email not confirmed</option>
            </select>
          </label>
        )}
        <button type="submit" style={{ ...row, justifyContent: 'center', background: '#1b1b1f', color: '#fff', fontWeight: 600 }}>Continue</button>
      </form>

      <form method="post" action={answer} style={{ marginTop: 10 }}>
        {request}
        <input type="hidden" name="answer" value="cancel" />
        <button type="submit" style={{ ...row, justifyContent: 'center', background: 'transparent' }}>Cancel</button>
      </form>
    </section>
  );
}
