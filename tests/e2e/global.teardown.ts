import { test as teardown } from '@playwright/test';
import { resetE2eData } from './support/reset';

/**
 * After the app e2e projects: the same reset, so the dev server shared with development doesn't keep the
 * tasks, offers and bookings the tests made (they'd show on the landing page until the next run).
 */
teardown('reset seeded data again', async ({ request }) => {
  await resetE2eData(request);
});
