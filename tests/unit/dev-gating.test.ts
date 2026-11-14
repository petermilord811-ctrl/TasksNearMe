import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The development tools' own checks (completion plan 5.18), behind src/proxy.ts: dev sign-in only sends someone
 * to a path on this site, and the /dev layout refuses requests from elsewhere for the paths the proxy's matcher
 * skips.
 */

const state = vi.hoisted(() => ({ headers: new Headers({ host: 'localhost:3000' }) }));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('redirect'), { url });
  },
  notFound: () => {
    throw Object.assign(new Error('not found'), { notFound: true });
  },
}));
vi.mock('@/platform/auth/auth', () => ({ auth: { api: { createVerificationOTP: async () => '123456', signInEmailOTP: async () => ({}) } } }));
vi.mock('@/platform/db/client', () => ({ db: {} }));

const { devSignInAs } = await import('@/platform/auth/dev-sign-in');
const DevLayout = (await import('@/app/[locale]/dev/layout')).default;

beforeEach(() => {
  state.headers = new Headers({ host: 'localhost:3000' });
});

const redirectedTo = async (target: string) => {
  const form = new FormData();
  form.set('email', 'maya@example.test');
  form.set('target', target);
  try {
    await devSignInAs(form);
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
};

describe('dev sign-in', () => {
  it('lands on a path of this site', async () => {
    expect(await redirectedTo('/app/bookings')).toBe('/app/bookings');
  });

  it.each(['//evil.example/app', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)'])('sends %s to the app home instead', async (target) => {
    expect(await redirectedTo(target)).toBe('/app');
  });
});

describe('the /dev layout', () => {
  /** Renders the layout's async check: the element inside its Suspense boundary. */
  const check = async () => {
    const outer = DevLayout({ children: 'tools' }) as { props: { children: { type: (props: { children: string }) => Promise<unknown>; props: { children: string } } } };
    const inner = outer.props.children;
    return inner.type(inner.props);
  };

  it('shows the tools to a request made on this machine', async () => {
    await expect(check()).resolves.toBe('tools');
  });

  it('says not found to a request from elsewhere, whatever the path', async () => {
    state.headers = new Headers({ host: 'app.example.test', 'x-forwarded-for': '203.0.113.7' });
    await expect(check()).rejects.toMatchObject({ notFound: true });
  });
});
