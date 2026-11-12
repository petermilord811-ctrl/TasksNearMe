import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { appUrl, standInSecret } from '@/integrations/oauth';
import { issueStandInCode, type StandInClaims } from '@/integrations/oauth/stand-in';
import { customStandInClaims } from '@/integrations/oauth/stand-in-people';
import { accounts, users } from '@/modules/accounts/schema';
import { disconnectSignIn, getSignInMethods } from '@/modules/accounts/sign-in-methods';
import { MICROSOFT_PERSONAL_TENANT } from '@/modules/accounts/sign-in/providers';
import { auditLog } from '@/platform/audit/schema';
import { createAuth } from '@/platform/auth/config';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * Google and Microsoft sign-in through Better Auth's real endpoints (sign-in, callback, link), with the
 * stand-in in place of the provider's page: the test plays the browser, carrying cookies between requests.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const auth = createAuth(db, { nextCookies: false });
afterAll(() => pool.end());

const BASE = appUrl();
type Provider = 'google' | 'microsoft';

class Browser {
  private jar = new Map<string, string>();
  get cookie() {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  keep(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const at = pair!.indexOf('=');
      const name = pair!.slice(0, at).trim();
      const value = pair!.slice(at + 1);
      if (/max-age=0/i.test(line) || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async post(path: string, body: object) {
    const response = await auth.handler(new Request(`${BASE}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie: this.cookie }, body: JSON.stringify(body) }));
    this.keep(response);
    return response;
  }
  async get(url: string) {
    const response = await auth.handler(new Request(url, { headers: { cookie: this.cookie } }));
    this.keep(response);
    return response;
  }
}

const NEXT = '/sign-in?next=%2Fapp';

/** Starts a sign-in (or a link from the account page) and answers on the provider's page. */
async function signInWith(browser: Browser, provider: Provider, answer: { claims: StandInClaims } | { cancel: true } | { forged: StandInClaims }, link = false) {
  // Always the stand-in, even if real keys are set where the tests run.
  const additionalParams = { tnm_stand_in: '1' };
  const start = link
    ? await browser.post('/link-social', { provider, callbackURL: `/app/account?connect=${provider}`, errorCallbackURL: `/app/account?connect=${provider}`, disableRedirect: true, additionalParams })
    : await browser.post('/sign-in/social', { provider, callbackURL: NEXT, newUserCallbackURL: `${NEXT}&new=1`, errorCallbackURL: `${NEXT}&via=${provider}`, disableRedirect: true, additionalParams });
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const chooser = new URL(url);
  expect(chooser.pathname).toBe(`/dev/oauth/${provider}`);
  const redirectUri = chooser.searchParams.get('redirect_uri')!;
  const back = new URL(redirectUri);
  back.searchParams.set('state', chooser.searchParams.get('state')!);
  if ('cancel' in answer) back.searchParams.set('error', 'access_denied');
  else {
    const secret = 'forged' in answer ? 'not-the-secret' : standInSecret();
    const claims = 'forged' in answer ? answer.forged : answer.claims;
    back.searchParams.set('code', issueStandInCode(secret, { provider, claims, challenge: chooser.searchParams.get('code_challenge')!, redirectUri }));
  }
  const callback = await browser.get(back.toString());
  expect(callback.status).toBe(302);
  const location = new URL(callback.headers.get('location')!, BASE);
  return { location, error: location.searchParams.get('error') };
}

const google = (email: string, given: string, family: string, sub = `test-google-${email}`): StandInClaims => ({ sub, email, email_verified: true, name: `${given} ${family}`, given_name: given, family_name: family });
const userByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0];
const providerAccounts = async (userId: string) => db.select().from(accounts).where(eq(accounts.userId, userId));

describe('signing in with Google or Microsoft', () => {
  it('creates an account for a new person, with "First L.", names for the profile step, and no photo', async () => {
    const browser = new Browser();
    const email = 'robin.alvarez@example.test';
    const { location, error } = await signInWith(browser, 'google', { claims: { ...google(email, 'Robin', 'Alvarez'), picture: 'https://photo.example/r.jpg' } });
    expect(error).toBeNull();
    expect(location.pathname + location.search).toBe(`${NEXT}&new=1`);
    expect(browser.cookie).toMatch(/session_token=/);

    const user = await userByEmail(email);
    expect(user).toMatchObject({ name: 'Robin A.', firstName: 'Robin', lastName: 'Alvarez', emailVerified: true, image: null, status: 'active' });
    // Not done yet: the profile step still asks for age and terms.
    expect(user?.adultAttestedAt).toBeNull();
    const [account] = await providerAccounts(user!.id);
    expect(account).toMatchObject({ providerId: 'google', accountId: `test-google-${email}` });
    // Provider tokens are encrypted at rest.
    expect(account?.accessToken).toBeTruthy();
    expect(account?.accessToken).not.toContain('.');
    const audits = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, user!.id));
    expect(audits.map((row) => row.action)).toContain('account.sign_in_connected');

    // The same Google account next time: the same person, no second account.
    const again = await signInWith(new Browser(), 'google', { claims: google(email, 'Robin', 'Alvarez') });
    expect(again.location.pathname + again.location.search).toBe(NEXT);
    expect(await providerAccounts(user!.id)).toHaveLength(1);
  });

  it('joins an existing account when Google confirms its email, without changing its names', async () => {
    await throwawayClient(db, 'usr_social_join');
    const { error } = await signInWith(new Browser(), 'google', { claims: google('usr_social_join@example.test', 'Someone', 'Else') });
    expect(error).toBeNull();
    expect((await providerAccounts('usr_social_join')).map((row) => row.providerId)).toEqual(['google']);
    expect(await userByEmail('usr_social_join@example.test')).toMatchObject({ id: 'usr_social_join', firstName: 'Ruth' });
  });

  it("creates a Microsoft personal account's user, and a work account's only when its domain is verified", async () => {
    expect((await signInWith(new Browser(), 'microsoft', { claims: customStandInClaims('microsoft', 'Noor Haddad', 'noor.test@example.test', 'personal') })).error).toBeNull();
    expect(await userByEmail('noor.test@example.test')).toMatchObject({ firstName: 'Noor', lastName: 'Haddad', emailVerified: true });

    expect((await signInWith(new Browser(), 'microsoft', { claims: customStandInClaims('microsoft', 'Lena Ortiz', 'lena.test@contoso.example', 'work_verified') })).error).toBeNull();

    const refused = await signInWith(new Browser(), 'microsoft', { claims: customStandInClaims('microsoft', 'Drew Patel', 'drew.test@contoso.example', 'work_unverified') });
    expect(refused.error).toBe('email_not_confirmed');
    expect(refused.location.searchParams.get('via')).toBe('microsoft');
    expect(await userByEmail('drew.test@contoso.example')).toBeUndefined();
  });

  it("can't take over an account with a work account that claims someone else's email (nOAuth)", async () => {
    await throwawayClient(db, 'usr_social_victim');
    const attack = customStandInClaims('microsoft', 'Mallory', 'usr_social_victim@example.test', 'work_unverified');
    const { error } = await signInWith(new Browser(), 'microsoft', { claims: attack });
    expect(error).not.toBeNull();
    expect(await providerAccounts('usr_social_victim')).toEqual([]);
  });

  it("refuses suspended accounts, whether joining or already joined", async () => {
    await throwawayClient(db, 'usr_social_suspended');
    const claims = google('usr_social_suspended@example.test', 'Ruth', 'Okafor', 'test-google-suspended');
    // Joined while active, then suspended.
    expect((await signInWith(new Browser(), 'google', { claims })).error).toBeNull();
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'usr_social_suspended'));
    expect((await signInWith(new Browser(), 'google', { claims })).error).toBe('account_unavailable');

    await throwawayClient(db, 'usr_social_banned');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, 'usr_social_banned'));
    expect((await signInWith(new Browser(), 'google', { claims: google('usr_social_banned@example.test', 'Ruth', 'Okafor') })).error).toBe('account_unavailable');
    expect(await providerAccounts('usr_social_banned')).toEqual([]);
  });

  it('comes back with the reason when the person cancels or the code was tampered with', async () => {
    expect((await signInWith(new Browser(), 'google', { cancel: true })).error).toBe('access_denied');
    expect((await signInWith(new Browser(), 'google', { forged: google('forged@example.test', 'Forged', 'Person') })).error).toBe('invalid_code');
    expect(await userByEmail('forged@example.test')).toBeUndefined();
  });
});

describe('connecting from the account page', () => {
  it('connects Microsoft (even with a different email), refuses one used elsewhere, and disconnects', async () => {
    await throwawayClient(db, 'usr_social_connect');
    const browser = new Browser();
    // Signed in with Google first (joins the account by its email).
    expect((await signInWith(browser, 'google', { claims: google('usr_social_connect@example.test', 'Ruth', 'Okafor', 'test-google-connect') })).error).toBeNull();

    const personal = customStandInClaims('microsoft', 'Ruth Okafor', 'ruth.o@outlook.example', 'personal');
    const linked = await signInWith(browser, 'microsoft', { claims: personal }, true);
    expect(linked.error).toBeNull();
    expect(linked.location.pathname + linked.location.search).toBe('/app/account?connect=microsoft');
    const methods = await getSignInMethods(db, { id: 'usr_social_connect', email: 'usr_social_connect@example.test' }, { connect: 'microsoft' });
    expect(methods.notice).toEqual({ provider: 'microsoft', result: 'connected' });
    expect(methods.providers.map((row) => [row.provider, Boolean(row.connectedAt)])).toEqual([['google', true], ['microsoft', true]]);

    // That Microsoft account can't be connected to a second person.
    await throwawayClient(db, 'usr_social_other');
    const other = new Browser();
    expect((await signInWith(other, 'google', { claims: google('usr_social_other@example.test', 'Ruth', 'Okafor', 'test-google-other') })).error).toBeNull();
    expect((await signInWith(other, 'microsoft', { claims: personal }, true)).error).toBe('account_already_linked_to_different_user');

    expect(await disconnectSignIn(db, 'usr_social_connect', 'microsoft')).toBe(true);
    expect(await disconnectSignIn(db, 'usr_social_connect', 'microsoft')).toBe(false);
    expect((await db.select().from(accounts).where(and(eq(accounts.userId, 'usr_social_connect'), eq(accounts.providerId, 'microsoft'))))).toEqual([]);
    const audits = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, 'usr_social_connect'));
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(['account.sign_in_connected', 'account.sign_in_disconnected']));
  });

  it("a connected Microsoft personal account keeps working after the address changes (it's matched by account, not email)", async () => {
    const claims = { oid: 'test-ms-stable', tid: MICROSOFT_PERSONAL_TENANT, email: 'stable.one@example.test', name: 'Sky Rivers' };
    expect((await signInWith(new Browser(), 'microsoft', { claims })).error).toBeNull();
    const first = await userByEmail('stable.one@example.test');
    const again = await signInWith(new Browser(), 'microsoft', { claims: { ...claims, email: 'stable.two@example.test' } });
    expect(again.error).toBeNull();
    expect(await userByEmail('stable.two@example.test')).toBeUndefined();
    expect((await providerAccounts(first!.id)).map((row) => row.accountId)).toEqual(['test-ms-stable']);
  });
});
