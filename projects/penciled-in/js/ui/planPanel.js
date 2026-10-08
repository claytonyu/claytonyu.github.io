// Right-hand panel: everything about generating. Generate button, the settings that feed it,
// what came out of it, Google refresh, and export.
import { generate, login, refreshGoogle } from '../actions.js';
import { clear, h, syncChildren } from '../dom.js';
import { chunkIssues, chunkLabel, describeIssues } from '../issues.js';
import { downloadIcs } from '../ics.js';
import { clearNotice, setFocusDay, setSettings, state, subscribe } from '../store.js';
import { dayOfWall, fmtDuration, fmtInstant, fmtMonthDay, utcToWall } from '../time.js';
import { plural } from '../util.js';
import { showCalendarPane } from './tasksPanel.js';

// Covered live by "Heads up" below, or already acted on, so not repeated from the server list.
const HANDLED_CODES = new Set(['locked_chunk_overlaps_block', 'locked_chunk_after_deadline', 'orphan_locked_chunk']);

function timeZoneOptions(current) {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add('UTC');
  set.add(current);
  return [...set].sort();
}

export function mountPlan(root) {
  // ---- Generate ----
  const genBtn = h('button', { class: 'btn btn-primary btn-generate', type: 'button', onclick: generate });
  const genHint = h('p', { class: 'hint' });
  const notices = h('div', { class: 'notices', 'aria-live': 'polite' });

  // ---- Settings (inputs to generation) ----
  const setErr = h('p', { class: 'form-error', role: 'alert' });
  const evenRadio = h('input', { type: 'radio', name: 'spread', value: 'even', id: 'spread-even' });
  const frontRadio = h('input', { type: 'radio', name: 'spread', value: 'front_load', id: 'spread-front' });
  const padding = h('input', { type: 'number', id: 'set-padding', min: 0, max: 240, step: 5, inputMode: 'numeric' });
  const workStart = h('input', { type: 'time', id: 'set-wstart' });
  const workEnd = h('input', { type: 'time', id: 'set-wend' });
  const tzSelect = h('select', { id: 'set-tz' });

  const apply = (patch) => {
    setErr.textContent = '';
    const err = setSettings(patch);
    if (err) {
      setErr.textContent = err;
      fillSettings();
    }
  };
  for (const radio of [evenRadio, frontRadio]) {
    radio.addEventListener('change', () => radio.checked && apply({ spread_mode: radio.value }));
  }
  padding.addEventListener('change', () => {
    const n = parseInt(padding.value, 10);
    if (Number.isNaN(n)) {
      setErr.textContent = 'Padding must be a whole number of minutes.';
      fillSettings();
    } else apply({ padding_min: n });
  });
  workStart.addEventListener('change', () => workStart.value && apply({ work_start: workStart.value }));
  workEnd.addEventListener('change', () => workEnd.value && apply({ work_end: workEnd.value }));
  tzSelect.addEventListener('change', () => apply({ timezone: tzSelect.value }));

  function fillSettings() {
    const s = state.settings;
    evenRadio.checked = s.spread_mode === 'even';
    frontRadio.checked = s.spread_mode === 'front_load';
    padding.value = String(s.padding_min);
    workStart.value = s.work_start;
    workEnd.value = s.work_end;
    clear(tzSelect);
    for (const z of timeZoneOptions(s.timezone)) tzSelect.append(h('option', { value: z, text: z.replace(/_/g, ' ') }));
    tzSelect.value = s.timezone;
  }

  const settingsSection = h(
    'section',
    { class: 'plan-section', 'aria-labelledby': 'plan-settings-h' },
    h('h2', { id: 'plan-settings-h', class: 'plan-h', text: 'Planning settings' }),
    h(
      'fieldset',
      { class: 'field' },
      h('legend', { text: 'Spread work' }),
      h('label', { class: 'radio', for: 'spread-even' }, evenRadio, h('span', {}, h('strong', { text: 'Evenly' }), ' across the days before each deadline')),
      h('label', { class: 'radio', for: 'spread-front' }, frontRadio, h('span', {}, h('strong', { text: 'Front-loaded' }), ': finish as early as possible')),
    ),
    h('div', { class: 'field' }, h('label', { for: 'set-padding', text: 'Padding around blocks (minutes)' }), padding),
    h(
      'fieldset',
      { class: 'field' },
      h('legend', { text: 'Working hours' }),
      h(
        'div',
        { class: 'pair' },
        h('label', { class: 'unit', for: 'set-wstart' }, 'From', workStart),
        h('label', { class: 'unit', for: 'set-wend' }, 'To', workEnd),
      ),
    ),
    h('div', { class: 'field' }, h('label', { for: 'set-tz', text: 'Time zone' }), tzSelect),
    setErr,
  );

  // ---- Results (outputs of generation) ----
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const exportBtn = h('button', {
    class: 'btn',
    type: 'button',
    text: 'Export .ics',
    onclick: () => downloadIcs(state.chunks, state.tasks),
  });
  const exportHint = h('p', { class: 'hint', text: 'Tasks only. Your blocks and Google events are not included.' });

  // ---- Google + sync ----
  // The Refresh Google button itself lives in the top bar, above Generate.
  const googleInfo = h('p', { class: 'hint' });
  const googleSection = h(
    'section',
    { class: 'plan-section', 'aria-labelledby': 'plan-google-h' },
    h('h2', { id: 'plan-google-h', class: 'plan-h', text: 'Google Calendar' }),
    googleInfo,
  );
  const syncLine = h('p', { class: 'sync-line' });

  root.append(
    h(
      'section',
      { class: 'plan-section plan-top', 'aria-label': 'Generate' },
      genBtn,
      genHint,
    ),
    notices,
    settingsSection,
    h('section', { class: 'plan-section', 'aria-labelledby': 'plan-results-h' }, h('h2', { id: 'plan-results-h', class: 'plan-h', text: 'Results' }), results),
    h('section', { class: 'plan-section', 'aria-labelledby': 'plan-export-h' }, h('h2', { id: 'plan-export-h', class: 'plan-h', text: 'Export' }), exportBtn, exportHint),
    googleSection,
    syncLine,
  );

  // ---- Rendering ----
  const renderGenerate = () => {
    const busy = state.busy.generating;
    genBtn.disabled = busy || state.loading;
    genBtn.textContent = busy ? 'Generating…' : 'Generate schedule';
    const planned = state.chunks.length > 0 || state.result;
    genHint.textContent =
      state.inputsChanged && planned
        ? 'Your inputs changed since the last Generate. Press Generate to update the plan.'
        : 'The schedule only changes when you press Generate. Locked chunks stay put.';
    genHint.classList.toggle('stale', state.inputsChanged && !!planned);
  };

  const noticeEl = (n, dismissible) => {
    // Stored notices are looked up when clicked: syncChildren keeps unchanged buttons, which
    // must run the current action rather than one captured by an earlier render.
    const run = () => {
      const live = dismissible ? state.notices.find((x) => x.id === n.id) : n;
      if (live && live.action) live.action.run();
    };
    return h(
      'div',
      {
        class: `notice notice-${n.kind}`,
        role: n.kind === 'error' ? 'alert' : null,
        dataset: dismissible ? { noticeId: n.id } : null, // keeps notices with equal text distinct
      },
      h('p', { text: n.text }),
      h(
        'div',
        { class: 'notice-actions' },
        n.action ? h('button', { class: 'btn btn-sm', type: 'button', text: n.action.label, onclick: run }) : null,
        dismissible ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dismiss', text: '×', onclick: () => clearNotice(n.id) }) : null,
      ),
    );
  };

  // Diffed into the live region: re-creating an unchanged role="alert" would announce it again.
  const renderNotices = () => {
    const derived = [];
    if (state.loading) derived.push({ kind: 'info', text: 'Loading your data…' });
    if (state.busy.waking) {
      derived.push({ kind: 'info', text: 'Waking up the server. The first request after a quiet spell can take up to a minute.' });
    }
    if (state.mode === 'user') {
      if (state.googleError === 'reauth_required') {
        derived.push({
          kind: 'warn',
          text: 'Google needs you to reconnect before your calendar events can load.',
          action: { label: 'Reconnect Google', run: login },
        });
      } else if (state.googleError === 'google_unavailable') {
        derived.push({
          kind: 'warn',
          text: "Couldn't reach Google, so calendar events may be missing.",
          action: { label: 'Try again', run: refreshGoogle },
        });
      }
    }
    if (state.result && state.result.googleError && state.result.googleError !== state.googleError) {
      derived.push({ kind: 'warn', text: 'This plan was made without some Google events, so it may conflict with your calendar.' });
    }
    syncChildren(notices, [...derived.map((n) => noticeEl(n, false)), ...state.notices.map((n) => noticeEl(n, true))]);
  };

  // Looks the chunk up when clicked: a kept (unchanged) button must not point at a stale object.
  const jumpToChunk = (chunkId) => {
    const chunk = state.chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    setFocusDay(dayOfWall(utcToWall(Date.parse(chunk.start), state.settings.timezone)));
    showCalendarPane();
  };

  // Built as a list of nodes and diffed into the live region, so an unrelated re-render
  // doesn't make screen readers read every result again.
  const renderResults = () => {
    const nodes = [];
    buildResults(nodes);
    syncChildren(results, nodes);
  };

  const buildResults = (out) => {
    const r = state.result;
    const issues = chunkIssues(state);
    const tz = state.settings.timezone;
    if (!r && issues.size === 0) {
      out.push(h('p', { class: 'empty', text: 'Add tasks and press Generate. Anything that cannot fit will be listed here, along with how much time is missing.' }));
      return;
    }
    if (r) {
      out.push(
        h('p', {
          class: 'summary',
          text: r.placed
            ? `Placed ${plural(r.placed, 'work block')} totalling ${fmtDuration(r.placedMin)}.`
            : 'No new work blocks were placed.',
        }),
      );
      const tasks = new Map(state.tasks.map((t) => [t.id, t]));
      const short = r.unschedulable.filter((u) => tasks.has(u.task_id));
      if (short.length) {
        const passed = new Set(r.warnings.filter((w) => w.code === 'deadline_passed').map((w) => w.task_id));
        out.push(h('h3', { class: 'subhead bad', text: `Can't fit (${short.length})` }));
        const ul = h('ul', { class: 'result-list' });
        for (const u of short) {
          const t = tasks.get(u.task_id);
          ul.append(
            h(
              'li',
              {},
              h('strong', { text: t.title }),
              ` is short by ${fmtDuration(u.missing_min)}.`,
              h('span', { class: 'sub', text: passed.has(u.task_id) ? `Its deadline (${fmtInstant(Date.parse(t.due_at), tz)}) has already passed.` : `Due ${fmtInstant(Date.parse(t.due_at), tz)}. Try moving the deadline, allowing splitting, or freeing up time.` }),
            ),
          );
        }
        out.push(ul);
      }
      const warnings = r.warnings.filter((w) => !HANDLED_CODES.has(w.code) && w.code !== 'deadline_passed');
      if (warnings.length) {
        out.push(h('h3', { class: 'subhead warn', text: `Warnings (${warnings.length})` }));
        const ul = h('ul', { class: 'result-list' });
        for (const w of warnings) ul.append(h('li', { text: w.message }));
        out.push(ul);
      }
    }
    if (issues.size) {
      out.push(h('h3', { class: 'subhead warn', text: `Heads up (${issues.size})` }));
      const ul = h('ul', { class: 'result-list' });
      for (const [id, issue] of issues) {
        const chunk = state.chunks.find((c) => c.id === id);
        if (!chunk) continue;
        ul.append(
          h(
            'li',
            {},
            h('button', { class: 'link', type: 'button', text: chunkLabel(state, chunk), onclick: () => jumpToChunk(id) }),
            h('span', { class: 'sub', text: `This ${describeIssues(issue)}.` }),
          ),
        );
      }
      out.push(ul);
    }
  };

  const renderExport = () => {
    exportBtn.disabled = state.chunks.length === 0;
  };

  const renderGoogle = () => {
    const show = state.mode === 'user' && state.googleError !== 'not_connected' && state.googleError !== 'not_configured';
    googleSection.hidden = !show;
    const loaded = state.events.filter((ev) => {
      const cal = state.calendars.find((c) => c.id === ev.calendar_id);
      return !cal || cal.selected;
    });
    // Show the date range the app actually holds, so "events are missing" can be traced to
    // either the data (range is short) or the view (range is long, but you're on another week).
    let range = '';
    if (loaded.length) {
      const tz = state.settings.timezone;
      const starts = loaded.map((ev) => Date.parse(ev.start)).filter(Number.isFinite);
      const first = dayOfWall(utcToWall(Math.min(...starts), tz));
      const last = dayOfWall(utcToWall(Math.max(...starts), tz));
      range = first === last ? ` on ${fmtMonthDay(first)}` : ` from ${fmtMonthDay(first)} to ${fmtMonthDay(last)}`;
    }
    googleInfo.textContent = `${plural(loaded.length, 'event')} loaded${range}. Use Refresh Google at the top to reload them. Events are also fetched each time you generate.`;
  };

  const renderSync = () => {
    if (state.mode === 'guest') {
      syncLine.textContent = 'Saved in this browser. Log in to keep your plan across devices.';
      return;
    }
    const text = {
      idle: 'All changes saved.',
      pending: 'Saving your changes…',
      saving: 'Saving your changes…',
      error: "Couldn't save yet. Retrying automatically.",
    };
    syncLine.textContent = text[state.syncStatus] || '';
  };

  const renderAll = () => {
    renderGenerate();
    renderNotices();
    renderResults();
    renderExport();
    renderGoogle();
    renderSync();
  };

  subscribe(['data', 'status', 'auth'], renderAll);
  subscribe(['settings-ext'], fillSettings);
  fillSettings();
  renderAll();
}
