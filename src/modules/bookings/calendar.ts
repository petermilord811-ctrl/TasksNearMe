import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';
import type { BookingView } from '@/contracts';

/**
 * A calendar file (RFC 5545) for a booking. It names the general area, never the exact address:
 * calendar entries sync to other services and outlive the booking's address window.
 */

const HOUR = 3_600_000;

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escapes text per RFC 5545 §3.3.11. */
const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.calendar' }));

function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

/** How long to block: the hourly cap, or until the task window ends (at least an hour). */
function endOf(view: BookingView): Date {
  const start = Date.parse(view.terms.start);
  if (view.terms.pricing.type === 'hourly') return new Date(start + view.terms.pricing.hoursCap * HOUR);
  const windowEnd = Date.parse(view.task.schedule.windowEnd);
  return new Date(windowEnd > start + HOUR ? windowEnd : start + 2 * HOUR);
}

/** A name that ends a sentence ends in its own initial's stop ("With Jordan T. Details…"), never two (Spanish pass, 2026-11-21). */
const oneStop = (line: string) => line.replace(/([.?!…])\.(?=\s|$)/gu, '$1');

export function bookingCalendarFile(view: BookingView, bookingUrl: string, now: Date, locale: AppLocale = DEFAULT_LOCALE): string {
  const t = tFor(locale);
  const where = view.location.kind === 'remote' ? t('remote') : `${view.location.areaName}, ${view.location.marketName}`;
  const other = view.viewerRole === 'poster' ? view.helper.displayName : view.poster.displayName;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TasksNearMe//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${view.id}@tasksnearme`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(new Date(view.terms.start))}`,
    `DTEND:${stamp(endOf(view))}`,
    `SUMMARY:${text(t('eventTitle', { title: view.task.title }))}`,
    `LOCATION:${text(where)}`,
    `DESCRIPTION:${text(oneStop(t('description', { name: other, url: bookingUrl })))}`,
    `URL:${bookingUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
