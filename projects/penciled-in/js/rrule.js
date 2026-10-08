// Recurring blocks.
//
// Supports exactly the grammar the backend accepts (SPEC.md, "Unavailable time"):
// FREQ=DAILY|WEEKLY, INTERVAL, BYDAY (weekly only), UNTIL or COUNT, WKST.
// Occurrences keep the same local clock time in settings.timezone across DST, and the
// end keeps its wall-clock time too (an occurrence's length is measured in wall time).
import {
  DAY_MIN,
  dayFromYmd,
  fmtMonthDay,
  utcToWall,
  wallToUtc,
  weekdayOfDay,
  ymdOfDay,
} from './time.js';
import { pad2 } from './util.js';

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_STEPS = 60000; // loop guard; a rule yields at most one occurrence per day

// end: { kind: 'never' } | { kind: 'until', day } | { kind: 'count', count }
export function buildRule({ freq, interval = 1, byday = [], end = { kind: 'never' } }) {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === 'WEEKLY' && byday.length) {
    const codes = [...new Set(byday)].sort((a, b) => a - b).map((i) => WEEKDAY_CODES[i]);
    parts.push(`BYDAY=${codes.join(',')}`);
  }
  if (end.kind === 'until') {
    const { y, m, d } = ymdOfDay(end.day);
    parts.push(`UNTIL=${y}${pad2(m)}${pad2(d)}`);
  }
  if (end.kind === 'count') parts.push(`COUNT=${end.count}`);
  return parts.join(';');
}

export function parseRule(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (/^RRULE:/i.test(s)) s = s.slice(6);
  const rule = { freq: null, interval: 1, byday: null, wkst: 0, until: null, count: null };
  for (const part of s.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    const key = part.slice(0, eq).toUpperCase();
    const val = part.slice(eq + 1).toUpperCase();
    if (key === 'FREQ') {
      if (val !== 'DAILY' && val !== 'WEEKLY') return null;
      rule.freq = val;
    } else if (key === 'INTERVAL') {
      rule.interval = parseInt(val, 10);
      if (!(rule.interval >= 1)) return null;
    } else if (key === 'BYDAY') {
      const idx = val.split(',').map((c) => WEEKDAY_CODES.indexOf(c));
      if (idx.some((i) => i < 0)) return null;
      rule.byday = idx;
    } else if (key === 'WKST') {
      const i = WEEKDAY_CODES.indexOf(val);
      if (i < 0) return null;
      rule.wkst = i;
    } else if (key === 'COUNT') {
      rule.count = parseInt(val, 10);
      if (!(rule.count >= 1)) return null;
    } else if (key === 'UNTIL') {
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(val);
      if (!m) return null;
      if (m[4] === undefined) {
        rule.until = { kind: 'day', day: dayFromYmd(+m[1], +m[2], +m[3]) };
      } else {
        const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        rule.until = m[7] ? { kind: 'utc', ms: t } : { kind: 'wall', min: Math.floor(t / 60000) };
      }
    } else {
      return null;
    }
  }
  return rule.freq ? rule : null;
}

// Candidate dates (day numbers) in order, starting at the first occurrence's date.
// Like dateutil, weekly rules count weeks from the week (per WKST) containing the start.
function* candidateDays(rule, firstDay) {
  if (rule.freq === 'DAILY') {
    for (let k = 0; ; k++) yield firstDay + k * rule.interval;
    return;
  }
  const wkst = rule.wkst;
  const wanted = rule.byday && rule.byday.length ? rule.byday : [weekdayOfDay(firstDay)];
  const offsets = [...new Set(wanted.map((wd) => (wd - wkst + 7) % 7))].sort((a, b) => a - b);
  const weekStart = firstDay - ((weekdayOfDay(firstDay) - wkst + 7) % 7);
  for (let w = 0; ; w++) {
    const base = weekStart + w * 7 * rule.interval;
    for (const off of offsets) {
      if (base + off >= firstDay) yield base + off;
    }
  }
}

// Occurrences of a block that overlap [fromMs, toMs), as { start, end } UTC milliseconds.
export function expandBlock(block, tz, fromMs, toMs) {
  const s = Date.parse(block.start);
  const e = Date.parse(block.end);
  if (!(e > s)) return [];
  const single = e > fromMs && s < toMs ? [{ start: s, end: e }] : [];
  if (!block.rrule) return single;
  const rule = parseRule(block.rrule);
  if (!rule) return single; // unknown rule: show only the first occurrence

  const startWall = utcToWall(s, tz);
  const wallDur = utcToWall(e, tz) - startWall;
  const firstDay = Math.floor(startWall / DAY_MIN);
  const startMod = startWall - firstDay * DAY_MIN;
  const loDay = Math.floor(utcToWall(fromMs, tz) / DAY_MIN) - Math.ceil(wallDur / DAY_MIN) - 1;
  const hiDay = Math.floor(utcToWall(toMs, tz) / DAY_MIN) + 1;

  const out = [];
  let n = 0;
  let steps = 0;
  for (const day of candidateDays(rule, firstDay)) {
    if (day > hiDay || ++steps > MAX_STEPS) break;
    if (rule.until && rule.until.kind === 'day' && day > rule.until.day) break;
    if (rule.count !== null && n >= rule.count) break;
    n++;
    if (day < loDay) continue; // still counted toward COUNT, but nowhere near the window
    const sw = day * DAY_MIN + startMod;
    if (rule.until && rule.until.kind === 'wall' && sw > rule.until.min) break;
    const st = wallToUtc(sw, tz);
    if (rule.until && rule.until.kind === 'utc' && st > rule.until.ms) break;
    const en = wallToUtc(sw + wallDur, tz);
    if (en > fromMs && st < toMs) out.push({ start: st, end: en });
  }
  return out;
}

// The last day (day number) a rule can repeat on, whichever way UNTIL was written, or null.
// A UTC date-time is read as a calendar date in `tz`.
export function untilDay(rule, tz) {
  const u = rule && rule.until;
  if (!u) return null;
  if (u.kind === 'day') return u.day;
  if (u.kind === 'wall') return Math.floor(u.min / DAY_MIN);
  return tz ? Math.floor(utcToWall(u.ms, tz) / DAY_MIN) : Math.floor(u.ms / 86400000);
}

export function describeRule(text, tz) {
  const rule = parseRule(text);
  if (!rule) return 'Repeats';
  const unit = rule.freq === 'DAILY' ? 'day' : 'week';
  let out = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  if (rule.freq === 'WEEKLY' && rule.byday && rule.byday.length) {
    const days = [...new Set(rule.byday)].sort((a, b) => a - b).map((i) => WEEKDAY_LABELS[i]);
    out += ` on ${days.join(', ')}`;
  }
  const last = untilDay(rule, tz);
  if (last !== null) out += `, until ${fmtMonthDay(last)}`;
  if (rule.count !== null) out += `, ${rule.count} time${rule.count === 1 ? '' : 's'}`;
  return out;
}
