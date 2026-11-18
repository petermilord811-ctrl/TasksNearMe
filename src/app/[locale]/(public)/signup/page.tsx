import { redirect } from 'next/navigation';
import { routes } from '@/contracts';

/** The address people type or share for creating an account: it leads to `/sign-up` (completion plan 9.6). */
export default function SignupPage(): never {
  redirect(routes.signUp());
}
