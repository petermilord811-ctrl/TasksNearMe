import { routes, type AppShellHandlers, type MyClientsPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, findWorkNotBookableData, jordanShell, myClientsData, myClientsEmptyData } from '@/fixtures';
import { MyClientsScreen } from '@/ui/screens/clients/my-clients-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/clients.json';

const now = '2026-12-08T17:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: MyClientsPageData): PreviewEntry {
  return { id: `screen-my-clients/${variant}`, title, group: copy.listPreviews.group, layout: 'fullscreen', render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.clients()}><MyClientsScreen data={data} now={now} /></AppShell> };
}

export const myClientsPreviews: PreviewEntry[] = [
  preview('default', copy.listPreviews.default, myClientsData),
  preview('empty', copy.listPreviews.empty, myClientsEmptyData),
  preview('not-bookable', copy.listPreviews.notBookable, { ...myClientsData, setup: findWorkNotBookableData.setup, clients: myClientsData.clients.map((row) => ({ ...row, actions: [] })) }),
];
