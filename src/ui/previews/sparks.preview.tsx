import { routes, type ActionResult, type AppShellHandlers, type NewDirectMessagePageData, type PeopleSearchData, type PreviewEntry, type SparksHandlers, type SparksPageData } from '@/contracts';
import {
  fakeHandler, fakeNewChatHandlers, jordanShell, mayaShell, newDirectMessageClientData, newDirectMessageContactsOnlyData, newDirectMessageData, newDirectMessageLimitData, newDirectMessageSampleData,
  peopleSearchData, peopleSearchEmptyData, peopleSearchLimitData, peopleSearchNoMatchData, peopleSearchProData, sparksActiveData, sparksNewData, sparksPlanPendingData, sparksTopData, sparksUnavailableData,
} from '@/fixtures';
import { NewChat } from '@/ui/components/messaging/new-chat';
import { SparksScreen } from '@/ui/screens/sparks/sparks-screen';
import { AppShell } from '@/ui/shells/app-shell';

/** Sparks and starting a direct conversation (2026-11-21), in each state. */

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const sparksHandlers: SparksHandlers = { onBuy: fakeHandler({ ok: true, code: 'opened', redirectTo: routes.app.sparks() }) };
const nothing = () => undefined;

function sparksPreview(variant: string, title: string, data: SparksPageData, helper = true, result?: Parameters<typeof SparksScreen>[0]['initialResult']): PreviewEntry {
  return {
    id: `screen-sparks/${variant}`, title, group: 'Sparks', layout: 'fullscreen',
    render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.sparks()}>
      <SparksScreen data={data} handlers={sparksHandlers} {...(result ? { initialResult: result } : {})} />
    </AppShell>,
  };
}

/** New message with the person chosen: the first message's form (2026-11-21; in place since 2026-11-23). */
function directPreview(variant: string, title: string, data: NewDirectMessagePageData, options: { helper?: boolean; body?: string; result?: ActionResult } = {}): PreviewEntry {
  return {
    id: `screen-new-message/${variant}`, title, group: 'Messages', layout: 'fullscreen',
    render: () => <AppShell viewer={options.helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.newMessage({ userId: data.recipient.id })} layout="flow">
      <NewChat variant="page" to={{ userId: data.recipient.id }} start={{ status: 'ready', data: { kind: 'page', data } }} handlers={fakeNewChatHandlers} onChoose={nothing} onStarted={nothing} onRetry={nothing} {...(options.body ? { initialBody: options.body } : {})} {...(options.result ? { initialResult: options.result } : {})} />
    </AppShell>,
  };
}

/** New message finding the person: suggestions as the @username is typed (2026-11-23), or one that's nobody's. */
function findPreview(variant: string, title: string, search: PeopleSearchData, options: { typed?: string; notFound?: string } = {}): PreviewEntry {
  return {
    id: `screen-new-message/${variant}`, title, group: 'Messages', layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.newMessage()} layout="flow">
      <NewChat
        variant="page"
        {...(options.notFound ? { to: { username: options.notFound }, start: { status: 'error', notFound: true } } : { start: { status: 'idle' } })}
        initialSearch={search}
        {...(options.typed ? { initialQuery: options.typed } : {})}
        handlers={fakeNewChatHandlers}
        onChoose={nothing}
        onStarted={nothing}
        onRetry={nothing}
      />
    </AppShell>,
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
  directPreview('sample', 'New message: to a sample profile (the live site), who won’t reply', newDirectMessageSampleData),
  findPreview('find', 'New message: find someone by @username', peopleSearchEmptyData),
  findPreview('find-suggestions', 'New message: suggestions as “@jo” is typed', peopleSearchData, { typed: 'jo' }),
  findPreview('find-no-match', 'New message: nobody’s username starts with what’s typed', peopleSearchNoMatchData, { typed: 'jox' }),
  findPreview('find-not-found', 'New message: no one has that username', peopleSearchEmptyData, { notFound: 'jordan_tx' }),
  findPreview('find-limit', 'New message: the day’s conversations used up, by @username', peopleSearchLimitData),
  findPreview('find-pro', 'New message: Pro sets the allowance (100 a day)', peopleSearchProData),
  directPreview('result-limit', 'New message: the last one taken meanwhile', newDirectMessageData, { body: 'Hi Jordan! Do you assemble standing desks too?', result: { ok: false, code: 'limit_reached', retryAt: '2026-11-22T14:30:00.000Z' } }),
];
