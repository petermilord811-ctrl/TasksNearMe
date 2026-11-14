import { redirect } from 'next/navigation';
import { routes } from '@/contracts';

/**
 * Signing up and signing in are one flow on one page ("Sign in or create an account"): a new email gets one
 * extra step for the name. This is the address people expect to type or share, so it leads there.
 */
export default function SignUpPage(): never {
  redirect(routes.signIn());
}
