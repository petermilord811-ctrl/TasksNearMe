'use client';

import { usePathname } from 'next/navigation';
import type { AppShellHandlers, HelperSetupReminder, Mode } from '@/contracts';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from '@/shared/locale';
import { AppSearch } from './app-search';
import { VerifiedHelperReminder } from './verified-helper-reminder';

const HOME = routes.app.home();
const NEIGHBORS = routes.app.community();

/**
 * The row at the top of the app's pages (owner, 2026-11-23), where the full-width helper setup bar was: the search bar
 * and, for a helper who isn't verified yet, the reminder beside it. Not on Home, whose own search and "Needs your
 * attention" already lead with both. `currentPath`: the shell's, when it's given one (previews), else the browser's.
 */
export function AppTopRow({ mode, reminder, onAsk, currentPath }: { mode: Mode; reminder?: HelperSetupReminder; onAsk?: AppShellHandlers['onAskSearch']; currentPath?: string }) {
  const pathname = usePathname();
  const path = splitLocalePath(currentPath ?? pathname)?.path ?? currentPath ?? pathname;
  if (path === HOME) return null;
  const onNeighbors = path === NEIGHBORS || path.startsWith(`${NEIGHBORS}/`);
  // No layer of its own: the row scrolls under the pinned bar like the rest of the page (it sat on the bar's layer and
  // covered it, 2026-11-23); the search lifts itself only while its suggestions are open.
  return <div className="flex items-center gap-2.5 sm:gap-3">
    <AppSearch mode={mode} onNeighbors={onNeighbors} {...(onAsk ? { onAsk } : {})} />
    {reminder && mode === 'helper' && <VerifiedHelperReminder reminder={reminder} />}
  </div>;
}
