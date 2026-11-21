import { describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { signedOutAppDestination } from './signed-out-app';

describe('where a signed-out visitor to /app goes', () => {
  it('sends the post form to the form for people without an account, with the words a link carried (J-V5)', () => {
    expect(signedOutAppDestination('/app/tasks/new', new URLSearchParams('category=furniture-assembly&title=A+desk'))).toBe(routes.postTask({ category: 'furniture-assembly', title: 'A desk' }));
    expect(signedOutAppDestination('/app/tasks/new', new URLSearchParams('category=rocket-repair'))).toBe(routes.postTask());
  });

  it('signs in for Post again, a community post and everything else, and comes back', () => {
    expect(signedOutAppDestination('/app/tasks/new', new URLSearchParams('again=tsk_desk'))).toBe(routes.signIn('/app/tasks/new?again=tsk_desk'));
    expect(signedOutAppDestination('/app/bookings', new URLSearchParams())).toBe(routes.signIn('/app/bookings'));
  });
});
