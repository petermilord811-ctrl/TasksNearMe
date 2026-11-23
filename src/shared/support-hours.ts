import { LIVE_CHAT_HOURS, type LiveChatHours } from '@/contracts/support';
import { marketClockTime, marketDayKey, marketLocalToUtc } from './format';

/**
 * Live chat hours (2026-11-23, owner: "Live support: … office hours"): whether a person from support answers live
 * chats now, when that changes next, and the week's hours with days that share their hours together, all in support's
 * own zone (Gainesville's). Pure: the Help conversation gets it from the server with its data.
 */

type Week = typeof LIVE_CHAT_HOURS;
const DAY = 86_400_000;

/** The calendar day `days` after a "YYYY-MM-DD" day, and its weekday (Sunday 0). */
function dayAfter(key: string, days: number): { key: string; weekday: number } {
  const [year, month, date] = key.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(year, month - 1, date) + days * DAY);
  return { key: at.toISOString().slice(0, 10), weekday: at.getUTCDay() };
}

/** The week's hours, Monday first, with neighbouring days that share their hours as one range ("Mon–Fri"). */
export function liveChatSchedule(hours: Week = LIVE_CHAT_HOURS): LiveChatHours['schedule'] {
  const out: LiveChatHours['schedule'] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const day = hours.week[weekday];
    if (!day) continue;
    const [opens, closes] = day;
    const last = out.at(-1);
    const next = (last?.toDay ?? -1) === 6 ? 0 : (last?.toDay ?? -1) + 1;
    if (last && last.opens === opens && last.closes === closes && next === weekday) last.toDay = weekday;
    else out.push({ fromDay: weekday, toDay: weekday, opens, closes });
  }
  return out;
}

/** Whether live chat is answered at `now`, and when it next opens (or closes today). */
export function liveChatHoursAt(now: Date, hours: Week = LIVE_CHAT_HOURS): LiveChatHours {
  const { timeZone } = hours;
  const today = marketDayKey(now, timeZone);
  const clock = marketClockTime(now, timeZone);
  const schedule = liveChatSchedule(hours);
  const todays = hours.week[dayAfter(today, 0).weekday];
  if (todays && todays[0] <= clock && clock < todays[1]) {
    return { open: true, nextChange: marketLocalToUtc(today, todays[1], timeZone), schedule, timeZone };
  }
  // Closed: the next opening, today (before it opens) or within the week.
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const { key, weekday } = dayAfter(today, ahead);
    const day = hours.week[weekday];
    if (!day || (ahead === 0 && clock >= day[0])) continue;
    return { open: false, nextChange: marketLocalToUtc(key, day[0], timeZone), schedule, timeZone };
  }
  // No hours at all: closed for good (never with today's constant).
  return { open: false, nextChange: new Date(now.getTime() + 7 * DAY).toISOString(), schedule, timeZone };
}
