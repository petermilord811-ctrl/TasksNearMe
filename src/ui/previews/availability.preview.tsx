import type { ComponentProps } from 'react';
import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type AvailabilityHandlers, type AvailabilityPostInput, type MyAvailabilityPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, jordanShell, myAvailabilityAtLimitData, myAvailabilityData, myAvailabilityEmptyData, myAvailabilityNotBookableData, priyaShell, sundayPostHeld, yardPostActive } from '@/fixtures';
import { marketClockTime, marketDayKey } from '@/shared/format';
import { MyAvailabilityContent } from '@/ui/screens/availability/my-availability-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/availability.json';
import feedback from '../../../messages/en/ui/feedback.json';

const now = '2026-12-08T16:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: AvailabilityHandlers = { onCreate: fakeHandler({ ok: true, code: 'saved' }), onCancel: fakeHandler({ ok: true, code: 'canceled' }) };
const values: AvailabilityPostInput = { categorySlug: yardPostActive.categorySlug, date: marketDayKey(yardPostActive.start, 'America/Chicago'), startTime: marketClockTime(yardPostActive.start, 'America/Chicago'), endTime: marketClockTime(yardPostActive.end, 'America/Chicago'), pricing: yardPostActive.pricing };
const fieldErrors: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'], date: ['out_of_range'], startTime: ['out_of_range'], endTime: ['out_of_range'] } };
type Options = Omit<ComponentProps<typeof MyAvailabilityContent>, 'data' | 'now' | 'handlers'> & { handlers?: AvailabilityHandlers };

function preview(variant: string, title: string, data: MyAvailabilityPageData = myAvailabilityData, options: Options = {}): PreviewEntry {
  return { id: `screen-my-availability/${variant}`, title, group: copy.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={data.setup.bookable ? jordanShell : priyaShell} handlers={shellHandlers} currentPath={routes.app.availability()}>
    <MyAvailabilityContent data={data} handlers={handlers} now={now} {...options} />
  </AppShell> };
}

export const availabilityPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default),
  preview('empty', copy.previews.empty, myAvailabilityEmptyData),
  preview('at-limit', copy.previews['at-limit'], myAvailabilityAtLimitData),
  preview('not-bookable', copy.previews['not-bookable'], myAvailabilityNotBookableData),
  preview('submitting', copy.previews.submitting, myAvailabilityData, { initialPending: true, initialValues: values }),
  preview('errors', copy.previews.errors, myAvailabilityData, { initialResult: fieldErrors, initialValues: values, handlers: { ...handlers, onCreate: fakeHandler(fieldErrors) } }),
  preview('cancel-held', copy.previews['cancel-held'], myAvailabilityData, { initialConfirmId: sundayPostHeld.id }),
  preview('saved', copy.previews.saved, myAvailabilityData, { initialResult: { ok: true, code: 'saved' } }),
  preview('cancel-error', copy.previews['cancel-error'], myAvailabilityData, { initialConfirmId: sundayPostHeld.id, initialCancelResult: { ok: false, code: 'not_allowed' }, handlers: { ...handlers, onCancel: fakeHandler({ ok: false, code: 'not_allowed' }) } }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'validation_failed').map((code) => preview(`error-${code.replaceAll('_', '-')}`, feedback.error[code], myAvailabilityData, { initialValues: values, initialResult: { ok: false, code }, handlers: { ...handlers, onCreate: fakeHandler({ ok: false, code }) } })),
];
