import { z } from 'zod';
import { emailField } from '@/contracts';
import { appUrl, standInSecret, standInSocialProviders } from '@/integrations/oauth';
import { issueStandInCode, standInCallbackUrl } from '@/integrations/oauth/stand-in';
import { customStandInClaims, STAND_IN_PEOPLE } from '@/integrations/oauth/stand-in-people';
import { isSocialProvider } from '@/modules/accounts/sign-in/providers';

/**
 * The stand-in account chooser's answer (development only; 404 in production). Like a real provider, it
 * sends the browser back to Better Auth's callback with a full page load: a code for the chosen person, or
 * `access_denied` for Cancel. It never redirects anywhere but this app's own callback for the provider.
 */

const request = z.object({
  state: z.string().min(1).max(2000),
  redirectUri: z.string().min(1).max(2000),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  answer: z.enum(['approve', 'cancel']),
});

const someoneElse = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  kind: z.enum(['personal', 'work_verified', 'work_unverified']).default('personal'),
});

function problem(message: string, status = 400): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export async function POST(httpRequest: Request, { params }: RouteContext<'/[locale]/dev/oauth/[provider]/answer'>): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return problem('Not found', 404);
  const { provider } = await params;
  if (!isSocialProvider(provider) || !standInSocialProviders().includes(provider)) return problem('Not found', 404);

  const form = await httpRequest.formData();
  const parsed = request.safeParse({
    state: form.get('state'),
    redirectUri: form.get('redirect_uri'),
    challenge: form.get('code_challenge'),
    answer: form.get('answer'),
  });
  if (!parsed.success) return problem('The sign-in request is incomplete. Start again from the sign-in page.');
  const { state, redirectUri, challenge, answer } = parsed.data;
  if (redirectUri !== standInCallbackUrl(appUrl(), provider)) return problem('Unexpected callback address.');

  const back = new URL(redirectUri);
  back.searchParams.set('state', state);
  if (answer === 'cancel') {
    back.searchParams.set('error', 'access_denied');
    return Response.redirect(back, 303);
  }

  const key = form.get('person');
  let claims;
  if (typeof key === 'string' && key !== 'custom') {
    const person = STAND_IN_PEOPLE.find((candidate) => candidate.key === key && candidate.provider === provider);
    if (!person) return problem('Unknown sample person.');
    claims = person.claims;
  } else {
    const typed = someoneElse.safeParse({ name: form.get('name'), email: form.get('email'), kind: form.get('kind') ?? undefined });
    if (!typed.success) return problem('Enter a name and a valid email address.');
    claims = customStandInClaims(provider, typed.data.name, typed.data.email, typed.data.kind);
  }
  back.searchParams.set('code', issueStandInCode(standInSecret(), { provider, claims, challenge, redirectUri }));
  return Response.redirect(back, 303);
}
