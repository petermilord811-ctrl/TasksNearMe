'use client';

import type { BookingSheetHandlers } from '@/contracts';
import { BookingHubContent, type BookingHubScreenProps } from './booking-hub-screen';

// Existing app callers remain type-compatible until Claude supplies the new handlers.
// Keep mutations inside their forms and fail closed; never bypass a sheet via onAction.
const unavailableSheets: BookingSheetHandlers = {
  onPreviewCancel: () => Promise.reject(new Error('Cancellation preview is unavailable')),
  onCancel: () => Promise.resolve({ ok: false, code: 'not_allowed' }),
  onRunningLate: () => Promise.resolve({ ok: false, code: 'not_allowed' }),
  onReportNoShow: () => Promise.resolve({ ok: false, code: 'not_allowed' }),
  onCantAccess: () => Promise.resolve({ ok: false, code: 'not_allowed' }),
  onSafetyReport: () => Promise.resolve({ ok: false, code: 'not_allowed' }),
};

export function BookingHubWithoutSheetHandlers(props: Omit<BookingHubScreenProps, 'sheets'>) {
  return <BookingHubContent {...props} sheets={unavailableSheets} />;
}
