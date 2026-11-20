import { resetDatabase } from '../../db/scripts/lib';
import { checkMode, loadCheckEnv } from './guard';

/** The guard first (nothing is reset or called otherwise), then the test database reset (migrations + seed). */
export default async function setup(): Promise<void> {
  loadCheckEnv();
  checkMode();
  await resetDatabase(process.env.TEST_DATABASE_URL!);
}
