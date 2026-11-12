import { test as setup } from '@playwright/test';
import { resetE2eData } from './support/reset';

/** Before the app e2e projects: a clean, freshly seeded database (see ./support/reset.ts). */
setup('reset seeded data', async ({ request }) => {
  await resetE2eData(request);
});
