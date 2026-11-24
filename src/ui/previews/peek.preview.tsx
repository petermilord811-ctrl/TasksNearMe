import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry } from '@/contracts';
import { fakeHandler, helpArticlePeek, helpCenterPeek, helperPeek, helperSelfPeek, legalPeek, mayaShell } from '@/fixtures';
import { IdentityCheckDialog } from '@/ui/components/layout/identity-check-dialog';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
import { AppShell } from '@/ui/shells/app-shell';
import peek from '../../../messages/en/ui/peek.json';
import { PeekExample } from './peek-examples';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

/** A page under the sheet, so it reads as opened over the app. */
function Page() {
  return <div className="space-y-4">
    <h1 className="font-heading text-2xl font-bold">Saved helpers</h1>
    {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card" />)}
  </div>;
}

function entry(id: string, title: string, sheet: ReactNode): PreviewEntry {
  return {
    id: `peek/${id}`,
    group: peek.previews.group,
    title,
    layout: 'fullscreen',
    notes: 'From the bottom at 360; beside the page at 1280 (on the left while a chat window is open).',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.saved()}><Page />{sheet}</AppShell>,
  };
}

/** Peeks (2026-11-23): profiles, help and policies read beside the page instead of leaving it. */
export const peekPreviews: PreviewEntry[] = [
  entry('helper', peek.previews.helper, <PeekExample target={{ kind: 'helper', handle: 'sam-k' }} data={helperPeek} />),
  entry('helper-beside-chat', peek.previews.helperBesideChat, <PeekExample target={{ kind: 'helper', handle: 'sam-k' }} data={helperPeek} side="left" modal={false} />),
  entry('helper-self', peek.previews.helperSelf, <PeekExample target={{ kind: 'helper', handle: 'sam-k' }} data={helperSelfPeek} />),
  entry('help-center', peek.previews.helpCenter, <PeekExample target={{ kind: 'help' }} data={helpCenterPeek} />),
  entry('help-article', peek.previews.helpArticle, <PeekExample target={{ kind: 'help', slug: 'when-am-i-charged' }} data={helpArticlePeek} />),
  entry('legal', peek.previews.legal, <PeekExample target={{ kind: 'legal', doc: 'terms' }} data={legalPeek} />),
  entry('loading', peek.previews.loading, <PeekExample target={{ kind: 'helper', handle: 'sam-k' }} status="loading" />),
  entry('failed', peek.previews.failed, <PeekExample target={{ kind: 'help', slug: 'when-am-i-charged' }} status="error" />),
  {
    id: 'route-dialog/id-check',
    group: peek.previews.group,
    title: peek.previews.idCheck,
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.helperProfile('jordan-t')} layout="flow"><RouteDialogFrame><IdentityCheckDialog reason="staff_request" verifyHref={routes.app.verifyIdentity(routes.app.requestHelper('jordan-t'))} /></RouteDialogFrame></AppShell>,
  },
];
