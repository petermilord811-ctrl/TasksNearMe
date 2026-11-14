import { routes, type PreviewEntry, type WaitlistInput } from '@/contracts';
import { fakeHandler, publicViewer, signInEmailCodeStep, waitlistComingNextData, waitlistFromPostingData, waitlistPageData, waitlistPageDataBeta } from '@/fixtures';
import { WaitlistConfirmation, WaitlistScreen } from '@/ui/screens/public/waitlist-screen';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/waitlist.json';

export const waitlistPreviews: PreviewEntry[] = [
  {
    id: 'screen-waitlist/default',
    group: copy.previews.group,
    title: copy.previews.default,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.waitlist()}><WaitlistScreen data={waitlistPageData} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} /></PublicShell>,
  },
  {
    id: 'screen-waitlist/beta',
    group: copy.previews.group,
    title: copy.previews.beta,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.waitlist({ from: 'beta' })}><WaitlistScreen data={waitlistPageDataBeta} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} /></PublicShell>,
  },
  {
    id: 'screen-waitlist/coming-next',
    group: copy.previews.group,
    title: copy.previews.comingNext,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.waitlist()}><WaitlistScreen data={waitlistComingNextData} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} /></PublicShell>,
  },
  {
    id: 'screen-waitlist/from-posting',
    group: copy.previews.group,
    title: copy.previews.demand,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.waitlist({ zip: '75201' })}><WaitlistScreen data={waitlistFromPostingData} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} /></PublicShell>,
  },
  {
    id: 'waitlist/joined',
    group: copy.previews.group,
    title: copy.previews.joined,
    render: () => <div className="mx-auto max-w-reading"><WaitlistConfirmation email={signInEmailCodeStep.email!} zip="10001" /></div>,
  },
];
