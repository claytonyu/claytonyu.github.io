// Central app state, change notifications, and every mutation.
//
// Guests: changes are written to localStorage.
// Logged-in users: changes go into the sync queue (sync.js) and out as one PATCH /sync.
//
// Components subscribe to topics:
//   data          tasks / blocks / chunks / settings / calendars / events changed
//   view          calendar range or mode changed
//   auth          guest <-> user, loading state
//   status        busy flags, notices, results, sync state
//   settings-ext  settings were replaced wholesale (rebuild the settings form)
//   calendars-ext calendar list was replaced wholesale (rebuild the calendar list)
// Forms don't listen to their own edits, so typing never loses focus.
import { STORAGE } from './config.js';
import * as sync from './sync.js';
import { isValidTimeZone, parseHM, todayDay, weekdayOfDay } from './time.js';
import { uuid } from './util.js';

export function browserTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export const defaultSettings = () => ({
  padding_min: 15,
  work_start: '08:00',
  work_end: '22:00',
  spread_mode: 'even',
  timezone: browserTimeZone(),
});

export const state = {
  mode: 'guest', // 'guest' | 'user'
  user: null,
  loading: false,
  settings: defaultSettings(),
  calendars: [],
  tasks: [],
  blocks: [],
  chunks: [],
  dismissed: [],
  events: [],
  googleError: null,
  result: null, // last Generate: { unschedulable, warnings, placed, placedMin, at }
  inputsChanged: false, // inputs edited since the last Generate
  busy: { generating: false, refreshing: false, waking: false },
  syncStatus: 'idle',
  notices: [],
  view: { mode: 'week', focusDay: todayDay(browserTimeZone()) },
  ui: { tab: 'tasks' },
  version: 0,
};

// ---- Notifications ----
const subscribers = [];
let queuedTopics = new Set();
let flushQueued = false;

export function subscribe(topics, fn) {
  subscribers.push({ topics, fn });
}
export function emit(...topics) {
  if (topics.includes('data')) state.version++;
  for (const t of topics) queuedTopics.add(t);
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const fired = queuedTopics;
    queuedTopics = new Set();
    for (const sub of subscribers) {
      if (sub.topics.some((t) => fired.has(t))) {
        try {
          sub.fn(fired);
        } catch (err) {
          console.error(err);
        }
      }
    }
  });
}

const emitAll = () => emit('data', 'view', 'auth', 'status', 'settings-ext', 'calendars-ext');

// ---- Notices (banners in the right-hand panel) ----
export function notify(id, kind, text, action = null) {
  const n = { id, kind, text, action };
  const i = state.notices.findIndex((x) => x.id === id);
  if (i >= 0) state.notices[i] = n;
  else state.notices.push(n);
  emit('status');
}
export function clearNotice(id) {
  const before = state.notices.length;
  state.notices = state.notices.filter((n) => n.id !== id);
  if (state.notices.length !== before) emit('status');
}

// ---- Validation ----
export function validateSettings(s) {
  if (!Number.isInteger(s.padding_min) || s.padding_min < 0 || s.padding_min > 240) {
    return 'Padding must be a whole number from 0 to 240 minutes.';
  }
  const a = parseHM(s.work_start);
  const b = parseHM(s.work_end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'Working hours need a start and an end time.';
  if (b <= a) return 'Working hours must end later than they start. Overnight windows are not supported.';
  if (s.spread_mode !== 'even' && s.spread_mode !== 'front_load') return 'Unknown spread mode.';
  if (!isValidTimeZone(s.timezone)) return 'Choose a valid time zone.';
  return null;
}

// ---- Guest persistence ----
export function readGuest() {
  try {
    const raw = localStorage.getItem(STORAGE.guest);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return g && typeof g === 'object' ? g : null;
  } catch {
    return null;
  }
}
export function guestHasData(g) {
  return !!g && ((g.tasks || []).length > 0 || (g.blocks || []).length > 0 || (g.chunks || []).length > 0);
}
export function clearGuest() {
  try {
    localStorage.removeItem(STORAGE.guest);
  } catch {
    /* ignore */
  }
}
function saveGuest() {
  try {
    const { settings, tasks, blocks, chunks } = state;
    localStorage.setItem(STORAGE.guest, JSON.stringify({ settings, tasks, blocks, chunks }));
  } catch {
    notify('storage', 'warn', "Your browser wouldn't save this change locally (storage may be full or blocked).");
  }
}

const arr = (v) => (Array.isArray(v) ? v : []);

export function enterGuestState() {
  const g = readGuest() || {};
  const merged = { ...defaultSettings(), ...(g.settings && typeof g.settings === 'object' ? g.settings : {}) };
  state.mode = 'guest';
  state.user = null;
  state.loading = false;
  state.settings = validateSettings(merged) ? defaultSettings() : merged;
  state.tasks = arr(g.tasks);
  state.blocks = arr(g.blocks);
  const taskIds = new Set(state.tasks.map((t) => t.id));
  state.chunks = arr(g.chunks).filter((c) => taskIds.has(c.task_id));
  state.calendars = [];
  state.dismissed = [];
  state.events = [];
  state.googleError = null;
  state.result = null;
  state.inputsChanged = false;
  state.view.focusDay = todayDay(state.settings.timezone);
  emitAll();
}

// Show an empty, loading account view instead of flashing guest data.
export function beginUserLoading() {
  state.mode = 'user';
  state.loading = true;
  state.tasks = [];
  state.blocks = [];
  state.chunks = [];
  state.calendars = [];
  state.dismissed = [];
  state.events = [];
  state.googleError = null;
  state.result = null;
  state.inputsChanged = false;
  emitAll();
}

export function applyServerState(d) {
  const firstLoad = state.loading;
  state.mode = 'user';
  state.loading = false;
  state.user = d.user || null;
  state.settings = { ...defaultSettings(), ...(d.settings || {}) };
  state.calendars = arr(d.calendars);
  state.tasks = arr(d.tasks);
  state.blocks = arr(d.blocks);
  state.chunks = arr(d.chunks);
  state.dismissed = arr(d.dismissed_events);
  state.events = arr(d.google_events);
  state.googleError = d.google_error || null;
  if (firstLoad) state.view.focusDay = todayDay(state.settings.timezone);
  emitAll();
}

function afterChange({ input = true } = {}) {
  if (input) state.inputsChanged = true;
  if (state.mode === 'guest') saveGuest();
  emit('data', 'status');
}

const push = {
  upsert(collection, item) {
    if (state.mode === 'user') sync.queue.upsert(collection, item);
  },
  remove(collection, id) {
    if (state.mode === 'user') sync.queue.remove(collection, id);
  },
};

// ---- Tasks ----
export function addTask(task) {
  state.tasks.push(task);
  push.upsert('tasks', task);
  afterChange();
}
export function updateTask(task) {
  const i = state.tasks.findIndex((t) => t.id === task.id);
  if (i < 0) return;
  state.tasks[i] = task;
  push.upsert('tasks', task);
  afterChange();
}
export function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  for (const c of state.chunks.filter((c) => c.task_id === id)) push.remove('chunks', c.id);
  state.chunks = state.chunks.filter((c) => c.task_id !== id);
  push.remove('tasks', id);
  afterChange();
}

// ---- Blocks ----
export function addBlock(block) {
  state.blocks.push(block);
  push.upsert('blocks', block);
  afterChange();
}
export function updateBlock(block) {
  const i = state.blocks.findIndex((b) => b.id === block.id);
  if (i < 0) return;
  state.blocks[i] = block;
  push.upsert('blocks', block);
  afterChange();
}
export function deleteBlock(id) {
  state.blocks = state.blocks.filter((b) => b.id !== id);
  push.remove('blocks', id);
  afterChange();
}

// ---- Settings and calendars ----
// Returns an error message, or null on success.
export function setSettings(patch) {
  const merged = { ...state.settings, ...patch };
  const err = validateSettings(merged);
  if (err) return err;
  state.settings = merged;
  if (state.mode === 'user') sync.queue.settings(patch);
  afterChange();
  return null;
}
export function setCalendar(id, patch) {
  const cal = state.calendars.find((c) => c.id === id);
  if (!cal) return;
  Object.assign(cal, patch);
  sync.queue.calendar(id, patch);
  afterChange();
}

// ---- Dismissed Google events ----
export function dismissalsFor(ev) {
  return state.dismissed.filter(
    (d) =>
      d.calendar_id === ev.calendar_id &&
      ((d.scope === 'occurrence' && d.google_event_id === ev.id) ||
        (d.scope === 'series' && ev.recurring_event_id && d.google_event_id === ev.recurring_event_id)),
  );
}
export function dismissEvent(ev, scope) {
  const gid = scope === 'series' ? ev.recurring_event_id : ev.id;
  if (!gid) return;
  const exists = state.dismissed.some(
    (d) => d.calendar_id === ev.calendar_id && d.scope === scope && d.google_event_id === gid,
  );
  if (exists) return;
  const d = { id: uuid(), calendar_id: ev.calendar_id, google_event_id: gid, scope };
  state.dismissed.push(d);
  push.upsert('dismissed_events', d);
  afterChange();
}
export function restoreDismissals(ids) {
  const set = new Set(ids);
  state.dismissed = state.dismissed.filter((d) => !set.has(d.id));
  for (const id of ids) push.remove('dismissed_events', id);
  afterChange();
}

// ---- Chunks ----
export function updateChunk(id, patch) {
  const i = state.chunks.findIndex((c) => c.id === id);
  if (i < 0) return;
  state.chunks[i] = { ...state.chunks[i], ...patch };
  push.upsert('chunks', state.chunks[i]);
  afterChange({ input: false });
}
// Moving or resizing also locks the chunk (the user clearly wants it there).
export function toggleChunkLock(id) {
  const c = state.chunks.find((x) => x.id === id);
  if (c) updateChunk(id, { locked: !c.locked });
}
export function deleteChunk(id) {
  state.chunks = state.chunks.filter((c) => c.id !== id);
  push.remove('chunks', id);
  afterChange({ input: false });
}
// Drop every unlocked chunk and add the new proposals.
export function applyGenerated(newChunks) {
  for (const c of state.chunks) if (!c.locked) push.remove('chunks', c.id);
  state.chunks = state.chunks.filter((c) => c.locked);
  for (const c of newChunks) {
    state.chunks.push(c);
    push.upsert('chunks', c);
  }
  if (state.mode === 'guest') saveGuest();
  emit('data', 'status');
}

// ---- Calendar view ----
export function viewRange() {
  const n = state.view.mode === 'week' ? 7 : 1;
  const first = n === 7 ? state.view.focusDay - weekdayOfDay(state.view.focusDay) : state.view.focusDay;
  return { first, n };
}
export function setFocusDay(day) {
  state.view.focusDay = day;
  emit('view');
}
export function shiftView(dir) {
  state.view.focusDay += dir * (state.view.mode === 'week' ? 7 : 1);
  emit('view');
}
export function goToday() {
  state.view.focusDay = todayDay(state.settings.timezone);
  emit('view');
}
export function setViewMode(mode) {
  state.view.mode = mode;
  emit('view');
}
