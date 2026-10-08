// Google calendars: choose which ones block your time, optional padding per calendar,
// and the list of events you chose to ignore. Logged-in users only.
import { clear, h } from '../dom.js';
import { restoreDismissals, setCalendar, state, subscribe } from '../store.js';
import { fmtInstant } from '../time.js';

export function mountCalendars(root) {
  const calendarList = h('ul', { class: 'items' });
  const calendarEmpty = h('p', { class: 'empty', text: 'No calendars loaded. Use "Refresh Google" in the Plan panel.' });
  const dismissedWrap = h('div', { class: 'dismissed' });

  root.append(
    h(
      'div',
      { class: 'panel-head' },
      h('p', { class: 'panel-sub', text: 'Google calendars' }),
    ),
    h('p', {
      class: 'hint',
      text: 'Events from checked calendars count as unavailable time. After checking a new calendar, press Refresh Google to load its events.',
    }),
    calendarEmpty,
    calendarList,
    dismissedWrap,
  );

  // Rebuilt only when the list is replaced wholesale, so typing in a padding box keeps focus.
  const renderCalendars = () => {
    clear(calendarList);
    calendarEmpty.hidden = state.calendars.length > 0 || state.loading;
    for (const cal of state.calendars) {
      const checkId = `cal-sel-${cal.id}`;
      const padId = `cal-pad-${cal.id}`;
      const check = h('input', {
        type: 'checkbox',
        id: checkId,
        checked: !!cal.selected,
        onchange: (e) => setCalendar(cal.id, { selected: e.target.checked }),
      });
      const pad = h('input', {
        type: 'number',
        id: padId,
        min: 0,
        max: 240,
        step: 5,
        inputMode: 'numeric',
        placeholder: `${state.settings.padding_min}`,
        value: cal.padding_override_min === null || cal.padding_override_min === undefined ? '' : String(cal.padding_override_min),
        onchange: (e) => {
          const raw = e.target.value.trim();
          if (raw === '') return setCalendar(cal.id, { padding_override_min: null });
          const n = parseInt(raw, 10);
          if (!Number.isInteger(n) || n < 0 || n > 240) {
            e.target.value = cal.padding_override_min ?? '';
            return;
          }
          setCalendar(cal.id, { padding_override_min: n });
        },
      });
      calendarList.append(
        h(
          'li',
          { class: 'item item-col' },
          h('label', { class: 'check cal-name', for: checkId }, check, ` ${cal.name}`),
          h('label', { class: 'unit pad-override', for: padId }, 'Padding ', pad, ' min'),
        ),
      );
    }
  };

  const renderDismissed = () => {
    clear(dismissedWrap);
    if (!state.dismissed.length) return;
    const tz = state.settings.timezone;
    dismissedWrap.append(h('h3', { class: 'subhead', text: 'Ignored events' }));
    const ul = h('ul', { class: 'items' });
    for (const d of state.dismissed) {
      const match = state.events.find(
        (ev) =>
          ev.calendar_id === d.calendar_id &&
          (d.scope === 'series' ? ev.recurring_event_id === d.google_event_id : ev.id === d.google_event_id),
      );
      const label = match ? match.title || 'Busy' : 'Event outside the loaded range';
      const detail =
        d.scope === 'series' ? 'Every event in the series' : match ? fmtInstant(Date.parse(match.start), tz) : 'One event';
      ul.append(
        h(
          'li',
          { class: 'item' },
          h(
            'div',
            { class: 'item-main' },
            h('div', { class: 'item-title static', text: label }),
            h('div', { class: 'item-meta', text: detail }),
          ),
          h(
            'div',
            { class: 'item-actions' },
            h('button', {
              class: 'btn btn-sm',
              type: 'button',
              text: 'Restore',
              'aria-label': `Restore ${label}`,
              onclick: () => restoreDismissals([d.id]),
            }),
          ),
        ),
      );
    }
    dismissedWrap.append(ul);
  };

  subscribe(['calendars-ext', 'auth'], renderCalendars);
  subscribe(['data', 'auth'], renderDismissed);
  renderCalendars();
  renderDismissed();
}
