// App-level flows that combine the store, the API and the sync queue.
import * as api from './api.js';
import { clearToken, getToken, startLogin } from './auth.js';
import {
  CALENDAR_SELECT_DEBOUNCE_MS,
  EVENTS_DEBOUNCE_MS,
  EVENTS_MARGIN_DAYS,
  EVENTS_WINDOW_HALF_DAYS,
  LIMITS,
  MAX_OFFSET_DAYS,
} from './config.js';
import * as sync from './sync.js';
import {
  applyGenerated,
  applyServerState,
  beginUserLoading,
  clearGuest,
  clearNotice,
  deleteChunk,
  emit,
  enterGuestState,
  eventsCoverView,
  notify,
  readGuest,
  setFocusDay,
  state,
  viewCenterDay,
  viewRange,
} from './store.js';
import { dayOfWall, isValidTimeZone, todayDay, utcToWall } from './time.js';

export const login = startLogin;

// ---- Loading account data ----

// Send pending edits first so a refresh never overwrites unsaved work.
async function flushBeforeRead() {
  const res = await sync.flush();
  const status = res.err instanceof api.ApiError ? res.err.status : null;
  if (status === 401) return false; // session ended; the 401 handler already switched to guest mode
  if (!res.ok && !res.rejected) {
    notify('load-error', 'error', "Couldn't save your latest changes first, so nothing was refreshed.", {
      label: 'Try again',
      run: () => loadState({ syncGoogle: true }),
    });
    return false;
  }
  return true;
}

export async function loadState({ syncGoogle = true } = {}) {
  if (state.mode !== 'user') return false;
  clearNotice('load-error');
  state.busy.refreshing = true;
  emit('status');
  try {
    if (!(await flushBeforeRead())) return false;
    const previousEvents = state.events;
    // Events come back for 60 days centered on the week on screen, so what you are looking
    // at is always included. A paging fetch that started earlier is now out of date.
    const center = viewCenterDay();
    const offset = offsetFor(center);
    eventsSeq++;
    // The response can predate edits made while it loaded (a cold start takes a while).
    // Those edits are queued for the next sync, so replay them onto the response.
    const edits = sync.trackEdits();
    try {
      const data = await api.withRetry(() => api.getState(syncGoogle, offset));
      applyServerState(edits.overlay(data));
      keepPreviousEventsIfNoFreshOnes(previousEvents, data, syncGoogle);
      if (syncGoogle) noteEventsResult(data, offset, center);
    } finally {
      edits.stop();
    }
    return true;
  } catch (err) {
    if (!(err instanceof api.ApiError && err.status === 401)) {
      state.loading = false;
      notify('load-error', 'error', `Couldn't load your data. ${api.describeError(err)}`, {
        label: 'Try again',
        run: () => loadState({ syncGoogle }),
      });
      emit('auth');
    }
    return false;
  } finally {
    state.busy.refreshing = false;
    emit('status');
    // The view may have moved, or a fetch may have been waiting, while this load ran.
    resumeEventFetching();
  }
}

export async function enterUserMode({ afterLogin = false } = {}) {
  resetEventTracking();
  beginUserLoading();
  sync.loadPersisted();
  const ok = await loadState({ syncGoogle: true });
  if (ok && afterLogin) {
    const { offerImport } = await import('./ui/importDialog.js');
    offerImport();
  }
}

// The Refresh button: reload everything, with events centered on the week on screen.
export const refreshGoogle = () => loadState({ syncGoogle: true });

// ---- Google events follow the calendar ----
//
// GET /state returns 60 days of events centered on today + offset_days. We keep one window
// loaded and, when the view gets within EVENTS_MARGIN_DAYS of its edge, fetch a new one
// centered on the week on screen. This never blocks navigation: clicks just move the view,
// and the fetch (debounced, latest wins) fills in behind. Only the events from these
// responses are used; the rest of /state could be older than edits made on this page.

let eventsSeq = 0; // bumped by every full load or reset; older paging responses are ignored
let eventsTimer = null;
let eventsInFlight = false;
let eventsRerun = false; // a fetch was asked for while another one was running
let forceEventsFetch = false; // a calendar was just selected: fetch even if the window covers the view
let lastFetchedCenter = null; // a window centered on the same day would be identical, so don't repeat it

export function resetEventTracking() {
  clearTimeout(eventsTimer);
  eventsTimer = null;
  eventsSeq++;
  eventsRerun = false;
  forceEventsFetch = false;
  lastFetchedCenter = null;
}

function offsetFor(centerDay) {
  const offset = centerDay - todayDay(state.settings.timezone);
  return Math.max(-MAX_OFFSET_DAYS, Math.min(MAX_OFFSET_DAYS, offset));
}

// Remember which days the events we now hold cover, using the server's own clock and zone.
function noteEventsResult(data, offset, center) {
  if (data.google_error) {
    state.eventsFailed = true; // keep what we have; the Refresh button tries again
    emit('status');
    return;
  }
  const tz = (data.settings && data.settings.timezone) || state.settings.timezone;
  const serverNow = Date.parse(data.server_time);
  const serverCenter = todayDay(tz, Number.isFinite(serverNow) ? serverNow : Date.now()) + offset;
  state.eventWindow = { from: serverCenter - EVENTS_WINDOW_HALF_DAYS, to: serverCenter + EVENTS_WINDOW_HALF_DAYS };
  state.eventsFailed = false;
  lastFetchedCenter = center;
  clearNotice('events-error');
  emit('status');
}

// sync_google=false returns no events by design, and a Google failure may return none (or
// only some). In both cases keep what is already on screen, for calendars that still exist.
function keepPreviousEventsIfNoFreshOnes(previous, data, syncGoogle) {
  if (!previous.length || (syncGoogle && !data.google_error)) return;
  const calendarIds = new Set(state.calendars.map((c) => c.id));
  const seen = new Set(state.events.map(eventKey));
  const kept = previous.filter((e) => calendarIds.has(e.calendar_id) && !seen.has(eventKey(e)));
  if (kept.length) {
    state.events = [...state.events, ...kept];
    emit('data');
  }
}

function eventsApplicable() {
  return (
    state.mode === 'user' &&
    !state.loading &&
    state.googleError !== 'not_connected' &&
    state.googleError !== 'not_configured' &&
    state.calendars.some((c) => c.selected)
  );
}

function eventsNeeded() {
  if (!eventsApplicable() || state.eventsFailed) return false;
  const center = viewCenterDay();
  if (center === lastFetchedCenter) return false;
  // Past what the backend accepts, a new window would not help.
  if (Math.abs(center - todayDay(state.settings.timezone)) > MAX_OFFSET_DAYS - EVENTS_WINDOW_HALF_DAYS) return false;
  return !eventsCoverView(EVENTS_MARGIN_DAYS);
}

// Is a fetch running, or about to start, that will fill in the days on screen?
export function isLoadingEventsForView() {
  return state.busy.events || state.busy.refreshing || forceEventsFetch || eventsNeeded();
}

// Call whenever the view or the account state changes. Cheap when nothing is needed.
export function ensureEventsForView() {
  if (forceEventsFetch) return; // the pending forced fetch will use wherever the view is by then
  clearTimeout(eventsTimer);
  if (!eventsNeeded()) return;
  eventsTimer = setTimeout(runEventsFetch, EVENTS_DEBOUNCE_MS);
}

// A calendar was just selected: its events need loading. Debounced so ticking several
// boxes sends one request.
export function refetchEventsSoon() {
  forceEventsFetch = true;
  clearTimeout(eventsTimer);
  eventsTimer = setTimeout(runEventsFetch, CALENDAR_SELECT_DEBOUNCE_MS);
}

function resumeEventFetching() {
  if (forceEventsFetch || eventsRerun) {
    eventsRerun = false;
    clearTimeout(eventsTimer);
    eventsTimer = setTimeout(runEventsFetch, EVENTS_DEBOUNCE_MS);
  } else {
    ensureEventsForView();
  }
}

async function runEventsFetch() {
  eventsTimer = null;
  if (eventsInFlight || state.busy.refreshing) {
    eventsRerun = true; // resumeEventFetching() picks this up when the running fetch ends
    return;
  }
  const forced = forceEventsFetch;
  if (!eventsApplicable() || (!forced && !eventsNeeded())) {
    forceEventsFetch = false;
    return;
  }
  forceEventsFetch = false;
  eventsInFlight = true;
  state.busy.events = true;
  emit('status');
  const seq = ++eventsSeq;
  const center = viewCenterDay();
  const offset = offsetFor(center);
  try {
    // A calendar selection has to reach the server before it can fetch that calendar's events.
    const saved = await sync.flush();
    if (saved.err instanceof api.ApiError && saved.err.status === 401) return;
    const data = await api.withRetry(() => api.getState(true, offset, { quiet: true }), { tries: 3 });
    if (seq !== eventsSeq) return; // a full load or a logout happened meanwhile
    if (data.google_error) {
      // The plan panel already explains reauth_required / google_unavailable and offers a fix.
      state.googleError = data.google_error;
      noteEventsResult(data, offset, center);
    } else {
      state.events = Array.isArray(data.google_events) ? data.google_events : [];
      state.googleError = null;
      noteEventsResult(data, offset, center);
      emit('data');
    }
  } catch (err) {
    if (seq !== eventsSeq || (err instanceof api.ApiError && err.status === 401)) return;
    state.eventsFailed = true;
    notify('events-error', 'warn', `Couldn't load events for these dates. ${api.describeError(err)}`, {
      label: 'Try again',
      run: refreshGoogle,
    });
  } finally {
    eventsInFlight = false;
    state.busy.events = false;
    emit('status');
    resumeEventFetching();
  }
}

// ---- Session ----

export function handleUnauthorized() {
  if (!getToken() && state.mode !== 'user') return;
  clearToken();
  sync.reset();
  resetEventTracking();
  enterGuestState();
  notify('session', 'warn', "Your session has ended, so you're back in guest mode. Log in again to get your account data back.", {
    label: 'Log in',
    run: login,
  });
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    /* the token is discarded either way */
  }
  clearToken();
  sync.reset();
  resetEventTracking();
  enterGuestState();
  clearNotice('session');
  clearNotice('events-error');
}

export async function deleteAccount({ clearLocal = false } = {}) {
  await api.deleteAccount(); // throws on failure so the dialog can show why
  clearToken();
  sync.reset();
  resetEventTracking();
  if (clearLocal) clearGuest();
  enterGuestState();
}

// Import guest data into the account. An ordinary PATCH /sync: same IDs overwrite.
export async function importGuest({ withSettings }) {
  const g = readGuest() || {};
  const tasks = Array.isArray(g.tasks) ? g.tasks : [];
  const taskIds = new Set(tasks.map((t) => t.id));
  const body = {
    tasks: { upsert: tasks },
    blocks: { upsert: Array.isArray(g.blocks) ? g.blocks : [] },
    chunks: { upsert: (Array.isArray(g.chunks) ? g.chunks : []).filter((c) => taskIds.has(c.task_id)) },
  };
  if (withSettings && g.settings) body.settings = g.settings;
  const flushed = await sync.flush();
  if (!flushed.ok) throw flushed.err;
  await api.withRetry(() => api.patchSync(body));
  await loadState({ syncGoogle: false });
}

// ---- Generate ----

function buildScheduleRequest() {
  const s = state.settings;
  const body = {
    tasks: state.tasks.map((t) => {
      const out = {
        id: t.id,
        title: t.title,
        due_at: t.due_at,
        duration_min: t.duration_min,
        splittable: !!t.splittable,
      };
      if (t.splittable && t.min_chunk_min) out.min_chunk_min = t.min_chunk_min;
      return out;
    }),
    blocks: state.blocks.map((b) => ({ id: b.id, title: b.title || '', start: b.start, end: b.end, rrule: b.rrule || null })),
    settings: {
      padding_min: s.padding_min,
      work_start: s.work_start,
      work_end: s.work_end,
      spread_mode: s.spread_mode,
      timezone: s.timezone,
    },
    locked_chunks: state.chunks.filter((c) => c.locked).map((c) => ({
      id: c.id,
      task_id: c.task_id,
      start: c.start,
      end: c.end,
      locked: true,
    })),
    now: new Date().toISOString(),
  };
  if (state.mode === 'user') {
    body.calendars = state.calendars.map((c) => ({
      id: c.id,
      selected: !!c.selected,
      padding_override_min: c.padding_override_min ?? null,
    }));
  }
  return body;
}

function checkLimits() {
  if (!state.tasks.length) return 'Add at least one task first.';
  if (!isValidTimeZone(state.settings.timezone)) return 'Choose a valid time zone first.';
  if (state.tasks.length > LIMITS.tasks) return `Penciled In can plan up to ${LIMITS.tasks} tasks at a time.`;
  if (state.blocks.length > LIMITS.blocks) return `Penciled In supports up to ${LIMITS.blocks} unavailable-time blocks.`;
  if (state.chunks.filter((c) => c.locked).length > LIMITS.lockedChunks) {
    return `Too many locked chunks (limit ${LIMITS.lockedChunks}). Delete some and try again.`;
  }
  if (state.calendars.length > LIMITS.calendars) return `Too many calendars (limit ${LIMITS.calendars}).`;
  return null;
}

const eventKey = (e) => `${e.calendar_id}|${e.id}`;

// POST /schedule only fetches Google events from `now` up to the latest due date, while the
// events we hold (from GET /state) cover a 60-day window that includes the past. So a
// Generate response replaces only the range it covered, [now, cutoff), and leaves the rest
// alone. Old copies of events inside that range that the response no longer has (deleted in
// Google) are dropped; ignored events stay so they can still be restored.
function mergeEvents(fresh, nowMs) {
  const seen = new Set(fresh.map(eventKey));
  const dues = state.tasks.map((t) => Date.parse(t.due_at)).filter(Number.isFinite);
  const cutoff = dues.length ? Math.max(...dues) : Infinity;
  const kept = state.events.filter((e) => {
    if (seen.has(eventKey(e))) return false; // the fresh copy wins
    const start = Date.parse(e.start);
    return start < nowMs || start >= cutoff || dismissedLocally(e);
  });
  return [...fresh, ...kept];
}

function dismissedLocally(ev) {
  return state.dismissed.some(
    (d) =>
      d.calendar_id === ev.calendar_id &&
      ((d.scope === 'occurrence' && d.google_event_id === ev.id) ||
        (d.scope === 'series' && ev.recurring_event_id && d.google_event_id === ev.recurring_event_id)),
  );
}

export async function generate() {
  if (state.busy.generating) return;
  clearNotice('generate-error');
  const problem = checkLimits();
  if (problem) {
    notify('generate-error', 'error', problem);
    return;
  }
  state.busy.generating = true;
  emit('status');
  try {
    if (state.mode === 'user') {
      // Dismissals are read from the database, so save pending edits before scheduling.
      const saved = await sync.flush();
      const status = saved.err instanceof api.ApiError ? saved.err.status : null;
      if (status === 401) return; // session ended; already switched to guest mode
      if (!saved.ok && !saved.rejected) {
        notify('generate-error', 'error', "Couldn't save your latest changes before planning. Try again in a moment.");
        return;
      }
    }
    const request = buildScheduleRequest();
    const revisionAtRequest = state.inputRevision;
    const res = await api.withRetry(() => api.postSchedule(request), { tries: 3 });

    const warnings = Array.isArray(res.warnings) ? res.warnings : [];
    for (const w of warnings) {
      if (w.code === 'orphan_locked_chunk' && w.chunk_id) deleteChunk(w.chunk_id);
    }
    const newChunks = Array.isArray(res.chunks) ? res.chunks : [];
    applyGenerated(newChunks);

    if (state.mode === 'user') {
      // If Google failed, the response may hold only some events. Keep the ones we have.
      if (Array.isArray(res.google_events) && !res.google_error) {
        state.events = mergeEvents(res.google_events, Date.parse(request.now));
      }
      state.googleError = res.google_error || null;
    }
    const placedMin = newChunks.reduce((sum, c) => sum + (Date.parse(c.end) - Date.parse(c.start)) / 60000, 0);
    state.result = {
      unschedulable: Array.isArray(res.unschedulable) ? res.unschedulable : [],
      warnings,
      placed: newChunks.length,
      placedMin,
      googleError: res.google_error || null,
      at: Date.now(),
    };
    // Inputs edited while the request was running are not in this plan.
    state.inputsChanged = state.inputRevision !== revisionAtRequest;
    showNewChunks(newChunks);
    emit('data', 'status');
  } catch (err) {
    if (!(err instanceof api.ApiError && err.status === 401)) {
      notify('generate-error', 'error', `Couldn't generate a schedule. ${api.describeError(err)}`, {
        label: 'Try again',
        run: generate,
      });
    }
  } finally {
    state.busy.generating = false;
    emit('status');
  }
}

// If none of the new chunks are on screen, move the calendar to the earliest one.
function showNewChunks(chunks) {
  if (!chunks.length) return;
  const tz = state.settings.timezone;
  const days = chunks.map((c) => dayOfWall(utcToWall(Date.parse(c.start), tz)));
  const { first, n } = viewRange();
  if (days.some((d) => d >= first && d < first + n)) return;
  setFocusDay(Math.min(...days));
}
