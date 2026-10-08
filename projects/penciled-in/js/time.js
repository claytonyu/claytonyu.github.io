// Time zone helpers.
//
// Everything on screen is shown in settings.timezone, not the browser's zone.
// "Wall minutes" are minutes since 1970-01-01 00:00 on the *local clock* of that zone
// (a naive count that ignores DST jumps). Calendar positions, recurrence expansion and
// form inputs all work in wall minutes, then convert to real UTC instants at the edges.
import { pad2 } from './util.js';

export const DAY_MIN = 1440;
const MIN_MS = 60000;
const DAY_MS = 86400000;

const partsFormatters = new Map();
function partsFormatter(tz) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The local clock reading of instant `ms` in `tz`, as if that reading were UTC.
function wallMs(ms, tz) {
  const v = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') v[p.type] = parseInt(p.value, 10);
  }
  return Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second);
}

export function utcToWall(ms, tz) {
  return Math.floor(wallMs(ms, tz) / MIN_MS);
}

// Inverse of utcToWall. For a time that doesn't exist (spring-forward gap) or happens
// twice (fall-back), this picks one valid instant instead of failing.
export function wallToUtc(wallMin, tz) {
  const guess = wallMin * MIN_MS;
  const off1 = wallMs(guess, tz) - guess;
  let utc = guess - off1;
  const off2 = wallMs(utc, tz) - utc;
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

// ---- Day numbers (days since 1970-01-01, local calendar date) ----
export const dayOfWall = (wallMin) => Math.floor(wallMin / DAY_MIN);
export const todayDay = (tz, nowMs = Date.now()) => dayOfWall(utcToWall(nowMs, tz));
// Monday = 0 ... Sunday = 6. 1970-01-01 was a Thursday.
export const weekdayOfDay = (day) => (((day % 7) + 7 + 3) % 7);
export const dayFromYmd = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
export function ymdOfDay(day) {
  const d = new Date(day * DAY_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// ---- Display formatting (all inputs are wall minutes or day numbers) ----
const utcFmt = (opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });
let fClock, fDow, fDom, fDayLong, fMonthDay;

export function fmtClock(minOfDay) {
  fClock ||= utcFmt({ hour: 'numeric', minute: '2-digit' });
  return fClock.format(new Date(minOfDay * MIN_MS));
}
export function fmtDow(day) {
  fDow ||= utcFmt({ weekday: 'short' });
  return fDow.format(new Date(day * DAY_MS));
}
export function fmtDom(day) {
  fDom ||= utcFmt({ day: 'numeric' });
  return fDom.format(new Date(day * DAY_MS));
}
export function fmtMonthDay(day) {
  fMonthDay ||= utcFmt({ month: 'short', day: 'numeric' });
  return fMonthDay.format(new Date(day * DAY_MS));
}
export function fmtDayLong(day) {
  fDayLong ||= utcFmt({ weekday: 'short', month: 'short', day: 'numeric' });
  return fDayLong.format(new Date(day * DAY_MS));
}
export function fmtWall(wallMin) {
  const day = dayOfWall(wallMin);
  return `${fmtDayLong(day)}, ${fmtClock(wallMin - day * DAY_MIN)}`;
}
export const fmtInstant = (ms, tz) => fmtWall(utcToWall(ms, tz));

export function fmtRangeTitle(firstDay, lastDay) {
  const a = ymdOfDay(firstDay);
  const b = ymdOfDay(lastDay);
  if (firstDay === lastDay) return `${fmtDayLong(firstDay)}, ${a.y}`;
  if (a.y !== b.y) return `${fmtMonthDay(firstDay)}, ${a.y} – ${fmtMonthDay(lastDay)}, ${b.y}`;
  const sameMonth = a.m === b.m;
  return `${fmtMonthDay(firstDay)} – ${sameMonth ? b.d : fmtMonthDay(lastDay)}, ${b.y}`;
}

export function fmtDuration(min) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hrs}h ${rest}m` : `${hrs}h`;
}

// ---- Form input conversions ----
export const toInputDate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export function fromInputDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  return m ? dayFromYmd(+m[1], +m[2], +m[3]) : NaN;
}
export const toInputDateTime = (ms, tz) => {
  const wall = utcToWall(ms, tz);
  const day = dayOfWall(wall);
  const mod = wall - day * DAY_MIN;
  return `${toInputDate(day)}T${pad2(Math.floor(mod / 60))}:${pad2(mod % 60)}`;
};
export function fromInputDateTime(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str || '');
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / MIN_MS;
  return wallToUtc(wall, tz);
}

// "08:00" <-> minutes since midnight
export function parseHM(str) {
  const m = /^(\d{2}):(\d{2})$/.exec(str || '');
  if (!m) return NaN;
  const h = +m[1];
  const min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : NaN;
}
export const formatHM = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
