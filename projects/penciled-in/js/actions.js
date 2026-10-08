// App-level flows that combine the store, the API and the sync queue.
import * as api from './api.js';
import { clearToken, getToken, startLogin } from './auth.js';
import { LIMITS } from './config.js';
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
  notify,
  readGuest,
  setFocusDay,
  state,
  viewRange,
} from './store.js';
import { dayOfWall, isValidTimeZone, utcToWall } from './time.js';

export const login = startLogin;

// ---- Loading account data ----

// Send pending edits first so a refresh never overwrites unsaved work.
async function flushBeforeRead() {
  const res = await sync.flush();
  const status = res.err instanceof api.ApiError ? res.err.status : null;
  if (status === 401) return false; // session ended; the 401 handler already switched to guest mode
  if (!res.ok && status !== 422) {
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
    const data = await api.withRetry(() => api.getState(syncGoogle));
    applyServerState(data);
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
  }
}

export async function enterUserMode({ afterLogin = false } = {}) {
  beginUserLoading();
  sync.loadPersisted();
  const ok = await loadState({ syncGoogle: true });
  if (ok && afterLogin) {
    const { offerImport } = await import('./ui/importDialog.js');
    offerImport();
  }
}

export const refreshGoogle = () => loadState({ syncGoogle: true });

// ---- Session ----

export function handleUnauthorized() {
  if (!getToken() && state.mode !== 'user') return;
  clearToken();
  sync.reset();
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
  enterGuestState();
  clearNotice('session');
}

export async function deleteAccount({ clearLocal = false } = {}) {
  await api.deleteAccount(); // throws on failure so the dialog can show why
  clearToken();
  sync.reset();
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

// Keep dismissed events visible after Generate even if the response leaves them out.
function mergeEvents(fresh) {
  const seen = new Set(fresh.map((e) => `${e.calendar_id}|${e.id}`));
  const keptDismissed = state.events.filter((e) => !seen.has(`${e.calendar_id}|${e.id}`) && dismissedLocally(e));
  return [...fresh, ...keptDismissed];
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
      if (!saved.ok && status !== 422) {
        notify('generate-error', 'error', "Couldn't save your latest changes before planning. Try again in a moment.");
        return;
      }
    }
    const res = await api.withRetry(() => api.postSchedule(buildScheduleRequest()), { tries: 3 });

    const warnings = Array.isArray(res.warnings) ? res.warnings : [];
    for (const w of warnings) {
      if (w.code === 'orphan_locked_chunk' && w.chunk_id) deleteChunk(w.chunk_id);
    }
    const newChunks = Array.isArray(res.chunks) ? res.chunks : [];
    applyGenerated(newChunks);

    if (state.mode === 'user') {
      if (Array.isArray(res.google_events)) state.events = mergeEvents(res.google_events);
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
    state.inputsChanged = false;
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
