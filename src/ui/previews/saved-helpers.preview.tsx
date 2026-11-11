import { routes, type ActionResult, type AppShellHandlers, type PreviewEntry, type SavedHelperHandlers, type SavedHelpersPageData } from '@/contracts';
import { fakeHandler, mayaSavedHelpersData, mayaShell, savedHelpersEmptyData } from '@/fixtures';
import { SavedHelpersContent, SavedHelpersScreen } from '@/ui/screens/reviews/saved-helpers-screen';
import type { SavedHelpersPreviewState } from '@/ui/screens/reviews/saved-helpers-list';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/savedHelpers.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const updated: ActionResult = { ok: true, code: 'updated' };
const notFound: ActionResult = { ok: false, code: 'not_found' };
const unknown: ActionResult = { ok: false, code: 'unknown' };
const helperId = mayaSavedHelpersData.helpers[0].id;

function preview(variant: string, title: string, data: SavedHelpersPageData, state?: SavedHelpersPreviewState): PreviewEntry {
  const handlers: SavedHelperHandlers = { onToggleSaved: fakeHandler(state?.result ?? updated) };
  return {
    id: `screen-saved-helpers/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.saved()}>
      {state ? <SavedHelpersContent data={data} handlers={handlers} preview={state} /> : <SavedHelpersScreen data={data} handlers={handlers} />}
    </AppShell>,
  };
}

export const savedHelpersPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default, mayaSavedHelpersData),
  preview('empty', copy.previews.empty, savedHelpersEmptyData),
  preview('pending', copy.previews.pending, mayaSavedHelpersData, { helperId, pending: true }),
  preview('result-updated', copy.previews.updated, mayaSavedHelpersData, { helperId, result: updated }),
  preview('result-not-found', copy.previews.notFound, mayaSavedHelpersData, { helperId, result: notFound }),
  preview('result-unknown', copy.previews.unknown, mayaSavedHelpersData, { helperId, result: unknown }),
];
