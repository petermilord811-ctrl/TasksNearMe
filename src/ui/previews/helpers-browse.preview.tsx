import { routes, type AppShellHandlers, type HelpersBrowsePageData, type PreviewEntry, type SavedHelperHandlers } from '@/contracts';
import { fakeHandler, helpersBrowseData, helpersBrowseEmptyData, helpersBrowseFilteredData, mayaShell } from '@/fixtures';
import { HelpersBrowseScreen } from '@/ui/screens/browse';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/helpersBrowse.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: SavedHelperHandlers = { onToggleSaved: fakeHandler({ ok: true, code: 'updated' }) };

function browse(id: string, title: string, data: HelpersBrowsePageData): PreviewEntry {
  return {
    id: `screen-helpers-browse/${id}`, group: copy.previews.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.helpers(data.query)}><HelpersBrowseScreen data={data} handlers={handlers} /></AppShell>,
  };
}

const p = copy.previews;

export const helpersBrowsePreviews: PreviewEntry[] = [
  browse('default', p.default, helpersBrowseData),
  browse('filtered', p.filtered, helpersBrowseFilteredData),
  browse('empty', p.empty, helpersBrowseEmptyData),
];
