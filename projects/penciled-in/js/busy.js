// Everything that blocks the user's time: manual blocks (recurrence expanded) and
// imported Google events. Used by the calendar to draw and by issues.js to warn.
import { expandBlock } from './rrule.js';
import { dismissalsFor } from './store.js';

export const isDismissed = (state, ev) => dismissalsFor(ev).length > 0;

// Items overlapping [fromMs, toMs) once padding is included.
// { kind: 'block' | 'event', id, title, start, end, padMin, dismissed, ref }
export function busyItems(state, fromMs, toMs, { includeDismissed = false } = {}) {
  const tz = state.settings.timezone;
  const globalPad = state.settings.padding_min;
  const items = [];

  const blockPadMs = globalPad * 60000;
  for (const b of state.blocks) {
    for (const occ of expandBlock(b, tz, fromMs - blockPadMs, toMs + blockPadMs)) {
      items.push({
        kind: 'block',
        id: b.id,
        title: b.title || 'Unavailable',
        start: occ.start,
        end: occ.end,
        padMin: globalPad,
        dismissed: false,
        ref: b,
      });
    }
  }

  const calendars = new Map(state.calendars.map((c) => [c.id, c]));
  for (const ev of state.events) {
    const cal = calendars.get(ev.calendar_id);
    if (cal && !cal.selected) continue;
    const dismissed = isDismissed(state, ev);
    if (dismissed && !includeDismissed) continue;
    const start = Date.parse(ev.start);
    const end = Date.parse(ev.end);
    if (!(end > start)) continue;
    const padMin = cal && cal.padding_override_min !== null && cal.padding_override_min !== undefined
      ? cal.padding_override_min
      : globalPad;
    if (end + padMin * 60000 <= fromMs || start - padMin * 60000 >= toMs) continue;
    items.push({
      kind: 'event',
      id: ev.id,
      title: ev.title || 'Busy',
      start,
      end,
      padMin,
      dismissed,
      ref: ev,
    });
  }
  return items;
}
