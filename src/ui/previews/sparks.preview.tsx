import { routes, type AppShellHandlers, type FindPersonPageData, type NewDirectMessageHandlers, type NewDirectMessagePageData, type PreviewEntry, type SparksHandlers, type SparksPageData } from '@/contracts';
import {
  fakeHandler, findPersonData, findPersonLimitData, findPersonNotFoundData, findPersonProData, jordanShell, mayaShell, newDirectMessageClientData, newDirectMessageContactsOnlyData, newDirectMessageData, newDirectMessageLimitData,
  sparksActiveData, sparksNewData, sparksPlanPendingData, sparksTopData, sparksUnavailableData,
} from '@/fixtures';
import { FindPersonScreen } from '@/ui/screens/messages/find-person-screen';
import { NewDirectMessageScreen } from '@/ui/screens/messages/new-direct-message-screen';
import { SparksScreen } from '@/ui/screens/sparks/sparks-screen';
import { AppShell } from '@/ui/shells/app-shell';

/** Sparks and starting a direct conversation (2026-11-21), in each state. */

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const sparksHandlers: SparksHandlers = { onBuy: fakeHandler({ ok: true, code: 'opened', redirectTo: routes.app.sparks() }) };
const directHandlers: NewDirectMessageHandlers = { onStart: fakeHandler({ ok: true, code: 'sent', redirectTo: routes.app.messages() }) };

function sparksPreview(variant: string, title: string, data: SparksPageData, helper = true, result?: Parameters<typeof SparksScreen>[0]['initialResult']): PreviewEntry {
  return {
    id: `screen-sparks/${variant}`, title, group: 'Sparks', layout: 'fullscreen',
    render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.sparks()}>
      <SparksScreen data={data} handlers={sparksHandlers} {...(result ? { initialResult: result } : {})} />
    </AppShell>,
  };
}

function directPreview(variant: string, title: string, data: NewDirectMessagePageData, options: { helper?: boolean; body?: string; result?: Parameters<typeof NewDirectMessageScreen>[0]['initialResult'] } = {}): PreviewEntry {
  return {
    id: `screen-new-message/${variant}`, title, group: 'Messages', layout: 'fullscreen',
    render: () => <AppShell viewer={options.helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.newMessage({ userId: data.recipient.id })} layout="flow">
      <NewDirectMessageScreen data={data} handlers={directHandlers} {...(options.body ? { initialBody: options.body } : {})} {...(options.result ? { initialResult: options.result } : {})} />
    </AppShell>,
  };
}

function findPreview(variant: string, title: string, data: FindPersonPageData): PreviewEntry {
  return {
    id: `screen-new-message/${variant}`, title, group: 'Messages', layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.newMessage()} layout="flow"><FindPersonScreen data={data} /></AppShell>,
  };
}

export const sparksPreviews: PreviewEntry[] = [
  sparksPreview('new', 'Sparks: a new member with none yet', sparksNewData, false),
  sparksPreview('active', 'Sparks: earned and bought, back from checkout', sparksActiveData),
  sparksPreview('plan-pending', 'Sparks: with a plan, a checkout confirming', sparksPlanPendingData),
  sparksPreview('top', 'Sparks: the top level', sparksTopData),
  sparksPreview('unavailable', 'Sparks: buying not offered here', sparksUnavailableData, false),
  sparksPreview('result-rate-limited', 'Sparks: too many checkouts', sparksNewData, false, { ok: false, code: 'rate_limited', retryAt: '2026-11-21T16:20:00.000Z' }),
  directPreview('helper', 'New message: to a helper, with a task request', newDirectMessageData),
  directPreview('client', 'New message: to a client', newDirectMessageClientData, { helper: true }),
  directPreview('limit', 'New message: the day’s conversations used up', newDirectMessageLimitData),
  directPreview('contacts-only', 'New message: they take messages from task contacts only', newDirectMessageContactsOnlyData),
  findPreview('find', 'New message: find someone by @username', findPersonData),
  findPreview('find-not-found', 'New message: no one has that username', findPersonNotFoundData),
  findPreview('find-limit', 'New message: the day’s conversations used up, by @username', findPersonLimitData),
  findPreview('find-pro', 'New message: Pro sets the allowance (100 a day)', findPersonProData),
  directPreview('result-limit', 'New message: the last one taken meanwhile', newDirectMessageData, { body: 'Hi Jordan! Do you assemble standing desks too?', result: { ok: false, code: 'limit_reached', retryAt: '2026-11-22T14:30:00.000Z' } }),
];
