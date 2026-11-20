import { installFakeStripe } from './fake-stripe';
import { checkMode, loadCheckEnv } from './guard';

/**
 * In the check's worker, before its modules load (the app makes Stripe clients from the environment as modules load):
 * the guard again, and for the dry run, placeholder test keys and the in-memory Stripe.
 */
loadCheckEnv();
if (checkMode() === 'dry') {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dryrun';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_dryrun';
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  installFakeStripe();
}
