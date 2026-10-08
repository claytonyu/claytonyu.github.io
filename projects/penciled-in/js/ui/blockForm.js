import { field, h } from '../dom.js';
import { buildRule, parseRule, WEEKDAY_LABELS } from '../rrule.js';
import { addBlock, state, updateBlock } from '../store.js';
import {
  DAY_MIN,
  dayOfWall,
  fromInputDate,
  fromInputDateTime,
  toInputDate,
  toInputDateTime,
  utcToWall,
  wallToUtc,
  weekdayOfDay,
} from '../time.js';
import { uuid } from '../util.js';
import { closeModal, openModal } from './modal.js';
import { showToast } from './toast.js';

const MAX_LEN_MS = 366 * 86400000;
const YEAR_MIN = Date.UTC(2000, 0, 1);
const YEAR_MAX = Date.UTC(2101, 0, 1);

function defaultStart(tz) {
  // Next whole hour.
  const wall = utcToWall(Date.now(), tz);
  return wallToUtc(Math.ceil((wall + 1) / 60) * 60, tz);
}

export function openBlockForm(block = null) {
  const tz = state.settings.timezone;
  const rule = block && block.rrule ? parseRule(block.rrule) : null;
  const startMs = block ? Date.parse(block.start) : defaultStart(tz);
  const endMs = block ? Date.parse(block.end) : startMs + 3600000;

  const title = h('input', { type: 'text', maxlength: 200, autocomplete: 'off', placeholder: 'Sleep, class, lunch…', value: block ? block.title || '' : '' });
  const start = h('input', { type: 'datetime-local', required: true, value: toInputDateTime(startMs, tz) });
  const end = h('input', { type: 'datetime-local', required: true, value: toInputDateTime(endMs, tz) });

  const repeat = h(
    'select',
    { value: rule ? rule.freq : 'NONE' },
    h('option', { value: 'NONE', text: 'Does not repeat' }),
    h('option', { value: 'DAILY', text: 'Daily' }),
    h('option', { value: 'WEEKLY', text: 'Weekly' }),
  );
  const interval = h('input', { type: 'number', min: 1, max: 52, step: 1, inputMode: 'numeric', value: String(rule ? rule.interval : 1) });
  const intervalUnit = h('span', { class: 'unit-text' });

  const startWeekday = weekdayOfDay(dayOfWall(utcToWall(startMs, tz)));
  const picked = new Set(rule && rule.byday && rule.byday.length ? rule.byday : [startWeekday]);
  const dayBoxes = WEEKDAY_LABELS.map((label, i) =>
    h('label', { class: 'day-chip' }, h('input', { type: 'checkbox', value: String(i), checked: picked.has(i) }), h('span', { text: label })),
  );
  const daysRow = h('fieldset', { class: 'field' }, h('legend', { text: 'Repeat on' }), h('div', { class: 'chips' }, dayBoxes));

  const endsKind = rule ? (rule.until && rule.until.kind === 'day' ? 'until' : rule.count !== null ? 'count' : 'never') : 'never';
  const ends = h(
    'select',
    { value: endsKind },
    h('option', { value: 'never', text: 'Never' }),
    h('option', { value: 'until', text: 'On a date' }),
    h('option', { value: 'count', text: 'After a number of times' }),
  );
  const untilInput = h('input', {
    type: 'date',
    value: rule && rule.until && rule.until.kind === 'day' ? toInputDate(rule.until.day) : toInputDate(dayOfWall(utcToWall(startMs, tz)) + 84),
  });
  const countInput = h('input', { type: 'number', min: 1, max: 3660, step: 1, inputMode: 'numeric', value: String(rule && rule.count !== null ? rule.count : 10) });

  const repeatGroup = h('div', { class: 'repeat-group' });
  const intervalRow = h('div', { class: 'field' }, h('label', { for: 'block-interval', text: 'Every' }), h('div', { class: 'inline-fields' }, interval, intervalUnit));
  interval.id = 'block-interval';
  const endsRow = field('block-ends', 'Stop repeating', ends);
  const untilRow = field('block-until', 'Last day', untilInput);
  const countRow = field('block-count', 'Number of times', countInput);
  repeatGroup.append(intervalRow, daysRow, endsRow, untilRow, countRow);

  const error = h('p', { class: 'form-error', role: 'alert' });
  let movedFirst = false;

  const refresh = () => {
    const freq = repeat.value;
    repeatGroup.hidden = freq === 'NONE';
    daysRow.hidden = freq !== 'WEEKLY';
    intervalUnit.textContent = freq === 'WEEKLY' ? 'week(s)' : 'day(s)';
    untilRow.hidden = ends.value !== 'until';
    countRow.hidden = ends.value !== 'count';
  };
  repeat.addEventListener('change', refresh);
  ends.addEventListener('change', refresh);
  refresh();

  const fail = (msg) => {
    error.textContent = msg;
  };

  const submit = (e) => {
    e.preventDefault();
    error.textContent = '';
    movedFirst = false;
    const label = title.value.trim();
    if (label.length > 200) return fail('Keep the title to 200 characters.');
    let s = fromInputDateTime(start.value, tz);
    let en = fromInputDateTime(end.value, tz);
    if (Number.isNaN(s) || Number.isNaN(en)) return fail('Choose a start and an end.');
    if (en <= s) return fail('The end must be after the start.');
    if (en - s > MAX_LEN_MS) return fail('A block can be at most 366 days long.');
    if (s < YEAR_MIN || en >= YEAR_MAX) return fail('Dates must fall between the years 2000 and 2100.');

    let rrule = null;
    const freq = repeat.value;
    if (freq !== 'NONE') {
      const every = parseInt(interval.value, 10);
      if (!Number.isInteger(every) || every < 1 || every > 52) return fail('"Every" must be a whole number from 1 to 52.');
      let byday = [];
      if (freq === 'WEEKLY') {
        byday = dayBoxes.map((l, i) => (l.querySelector('input').checked ? i : -1)).filter((i) => i >= 0);
        if (!byday.length) return fail('Pick at least one day of the week.');
        // The first occurrence must itself be one of the chosen days, so move it forward if not.
        // Wall-clock times stay the same.
        const sWall = utcToWall(s, tz);
        const eWall = utcToWall(en, tz);
        const sDay = dayOfWall(sWall);
        let shift = 0;
        while (!byday.includes(weekdayOfDay(sDay + shift))) shift++;
        if (shift) {
          s = wallToUtc(sWall + shift * DAY_MIN, tz);
          en = wallToUtc(eWall + shift * DAY_MIN, tz);
          movedFirst = true;
        }
      }
      let endSpec = { kind: 'never' };
      if (ends.value === 'until') {
        const lastDay = fromInputDate(untilInput.value);
        if (Number.isNaN(lastDay)) return fail('Choose the last day of the repeat.');
        if (lastDay < dayOfWall(utcToWall(s, tz))) return fail('The last day is before the first occurrence.');
        endSpec = { kind: 'until', day: lastDay };
      } else if (ends.value === 'count') {
        const n = parseInt(countInput.value, 10);
        if (!Number.isInteger(n) || n < 1 || n > 3660) return fail('The number of times must be from 1 to 3660.');
        endSpec = { kind: 'count', count: n };
      }
      rrule = buildRule({ freq, interval: every, byday, end: endSpec });
    }

    const next = {
      id: block ? block.id : uuid(),
      title: label,
      start: new Date(s).toISOString(),
      end: new Date(en).toISOString(),
      rrule,
    };
    if (block) updateBlock(next);
    else addBlock(next);
    closeModal();
    if (movedFirst) showToast('The first occurrence moved to the next selected day.');
  };

  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: submit },
    field('block-title', 'Title', title),
    field('block-start', 'Starts', start, `Times are in ${tz}.`),
    field('block-end', 'Ends', end, 'For a repeating block, this is the end of the first occurrence. A 23:00 to 07:00 sleep block ends the next morning.'),
    field('block-repeat', 'Repeat', repeat),
    repeatGroup,
    error,
    h(
      'div',
      { class: 'modal-actions' },
      h('button', { class: 'btn', type: 'button', onclick: closeModal, text: 'Cancel' }),
      h('button', { class: 'btn btn-primary', type: 'submit', text: block ? 'Save block' : 'Add block' }),
    ),
  );
  openModal({ title: block ? 'Edit unavailable time' : 'New unavailable time', content: form });
  title.focus();
}
