import type { ReactNode } from 'react';
import { routes, type ActionResult, type AppShellHandlers, type AvailabilityHandlers, type NeighborhoodDayCardView, type PortalHandlers, type PreviewEntry, type RequestHelperHandlers } from '@/contracts';
import {
  fakeHandler,
  fakeRequestHelperHandlers,
  helpersBrowseWithDayData,
  jordanProfileWithDaysData,
  jordanShell,
  mayaShell,
  myAvailabilityWithDaysData,
  neighborhoodDayFilling,
  neighborhoodDayFormValues,
  neighborhoodDayStates,
  portalWithDaysData,
  PORTAL_NOW,
  publicViewer,
  requestJordanDayNoTaskData,
  requestJordanDayVisitData,
} from '@/fixtures';
import { NeighborhoodDayCard } from '@/ui/components/availability/neighborhood-day-card';
import { MyAvailabilityContent } from '@/ui/screens/availability/my-availability-screen';
import { HelpersBrowseScreen } from '@/ui/screens/browse';
import { PortalScreen } from '@/ui/screens/community/portal-screen';
import { RequestHelperContent } from '@/ui/screens/invites/request-helper-screen';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/neighborhoodDays.json';

/** Neighborhood days (2026-11-24): the card in every state, the helper's form and days, and where neighbors meet it. */

const p = copy.previews;
const now = '2026-12-08T16:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const availability: AvailabilityHandlers = {
  onCreate: fakeHandler({ ok: true, code: 'saved' }),
  onCancel: fakeHandler({ ok: true, code: 'canceled' }),
  onCreateDay: fakeHandler({ ok: true, code: 'saved' }),
  onCancelDay: fakeHandler({ ok: true, code: 'canceled' }),
};
const dayErrors: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { areaSlug: ['invalid'], 'visits.1.startTime': ['out_of_range'], 'visits.2.endTime': ['out_of_range'], neighborPriceCents: ['out_of_range'] } };
const portalHandlers: PortalHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
  onPost: fakeHandler({ ok: true, code: 'sent' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onEdit: fakeHandler({ ok: true, code: 'updated' }),
  onFollow: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onSetArea: fakeHandler({ ok: true, code: 'updated' }),
};
const requestHandlers: RequestHelperHandlers = fakeRequestHelperHandlers;

function cardPreview(state: keyof typeof neighborhoodDayStates, day: NeighborhoodDayCardView): PreviewEntry {
  return { id: `neighborhood-day-card/${state}`, group: p.group, title: p.card[state], render: () => <div className="mx-auto max-w-md"><NeighborhoodDayCard day={day} /></div> };
}

function app(id: string, title: string, path: string, children: ReactNode, viewer = mayaShell, layout?: 'flow'): PreviewEntry {
  return { id, group: p.group, title, layout: 'fullscreen', render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={path} {...(layout ? { layout } : {})}>{children}</AppShell> };
}

export const neighborhoodDayPreviews: PreviewEntry[] = [
  ...(Object.entries(neighborhoodDayStates) as [keyof typeof neighborhoodDayStates, NeighborhoodDayCardView][]).map(([state, day]) => cardPreview(state, day)),
  app('screen-my-availability/neighborhood-day', p.form, routes.app.availability(), <MyAvailabilityContent data={myAvailabilityWithDaysData} handlers={availability} now={now} />, jordanShell),
  app('screen-my-availability/neighborhood-day-filled', p.formFilled, routes.app.availability(), <MyAvailabilityContent data={myAvailabilityWithDaysData} handlers={availability} now={now} initialDayValues={neighborhoodDayFormValues} />, jordanShell),
  app('screen-my-availability/neighborhood-day-errors', p.formErrors, routes.app.availability(), <MyAvailabilityContent data={myAvailabilityWithDaysData} handlers={{ ...availability, onCreateDay: fakeHandler(dayErrors) }} now={now} initialDayValues={neighborhoodDayFormValues} initialDayResult={dayErrors} />, jordanShell),
  app('screen-my-availability/neighborhood-day-saved', p.formSaved, routes.app.availability(), <MyAvailabilityContent data={myAvailabilityWithDaysData} handlers={availability} now={now} initialDayResult={{ ok: true, code: 'saved' }} />, jordanShell),
  app('screen-my-availability/neighborhood-day-cancel', p.cancel, routes.app.availability(), <MyAvailabilityContent data={myAvailabilityWithDaysData} handlers={availability} now={now} initialConfirmId={neighborhoodDayFilling.id} />, jordanShell),
  app('screen-request-helper/neighborhood-day-visit', p.requestVisit, routes.app.requestHelper(requestJordanDayVisitData.helper.handle, { slotId: requestJordanDayVisitData.slot!.id }), <RequestHelperContent data={requestJordanDayVisitData} now={now} handlers={requestHandlers} />, mayaShell, 'flow'),
  app('screen-request-helper/neighborhood-day-no-task', p.requestNoTask, routes.app.requestHelper(requestJordanDayNoTaskData.helper.handle, { slotId: requestJordanDayNoTaskData.slot!.id }), <RequestHelperContent data={requestJordanDayNoTaskData} now={now} handlers={requestHandlers} />, mayaShell, 'flow'),
  app('screen-portal/neighborhood-days', p.portal, routes.app.community(), <PortalScreen data={portalWithDaysData} handlers={portalHandlers} now={PORTAL_NOW} />),
  app('screen-helpers-browse/neighborhood-day', p.browse, routes.app.helpers(helpersBrowseWithDayData.query), <HelpersBrowseScreen data={helpersBrowseWithDayData} handlers={{ onToggleSaved: fakeHandler({ ok: true, code: 'updated' }) }} />),
  {
    id: 'screen-helper-profile/neighborhood-days', group: p.group, title: p.profile, layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.helperProfile(jordanProfileWithDaysData.helper.handle)}><HelperProfileScreen data={jordanProfileWithDaysData} /></PublicShell>,
  },
];
