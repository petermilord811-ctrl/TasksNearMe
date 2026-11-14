import type React from 'react';
import type { AppShellHandlers, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts/routes';
import { fakeHandler, jordanShell, newSavedSearchPageData, savedSearchesEmptyData, savedSearchesPageData } from '@/fixtures';
import { NewSavedSearchScreen } from '@/ui/screens/searches/new-saved-search-screen';
import { SavedSearchesScreen } from '@/ui/screens/searches/saved-searches-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/savedSearches.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const listHandlers = { onAlert: fakeHandler<{ id: string; alert: 'instant' | 'daily' | 'off' }>({ ok: true, code: 'updated' }), onDelete: fakeHandler<{ id: string }>({ ok: true, code: 'updated' }) };
const p = copy.previews;
const shell = (path: string, node: React.ReactNode) => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={path}>{node}</AppShell>;

export const searchPreviews: PreviewEntry[] = [
  { id: 'screen-saved-searches/list', group: p.group, title: p.list, layout: 'fullscreen', render: () => shell(routes.app.savedSearches(), <SavedSearchesScreen data={savedSearchesPageData} handlers={listHandlers} boardHref={routes.taskBoard('austin')} />) },
  { id: 'screen-saved-searches/empty', group: p.group, title: p.empty, layout: 'fullscreen', render: () => shell(routes.app.savedSearches(), <SavedSearchesScreen data={savedSearchesEmptyData} handlers={listHandlers} boardHref={routes.taskBoard('austin')} />) },
  { id: 'screen-saved-searches/new', group: p.group, title: p.new, layout: 'fullscreen', render: () => shell(routes.app.savedSearches(), <NewSavedSearchScreen data={newSavedSearchPageData} handlers={{ onSave: fakeHandler({ ok: true, code: 'saved' }) }} />) },
];
