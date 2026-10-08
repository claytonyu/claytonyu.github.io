// Debounced, batched PATCH /sync (logged-in users only).
//
// Edits are merged into a "pending" object (also mirrored to localStorage so a crash
// doesn't lose them) and sent about 2 seconds after the last edit, and when the tab
// is hidden. /sync is atomic and idempotent, so retrying is always safe.
import * as api from './api.js';
import { KEEPALIVE_MAX_BYTES, STORAGE, SYNC_DEBOUNCE_MS } from './config.js';

const COLLECTIONS = ['tasks', 'blocks', 'chunks', 'dismissed_events'];

const emptyPending = () => ({
  settings: {},
  calendars: {},
  tasks: { upsert: {}, delete: {} },
  blocks: { upsert: {}, delete: {} },
  chunks: { upsert: {}, delete: {} },
  dismissed_events: { upsert: {}, delete: {} },
});

// Merge `newer` over `older` (newer wins), returning a fresh object.
function mergePending(older, newer) {
  const out = JSON.parse(JSON.stringify(older));
  Object.assign(out.settings, newer.settings);
  for (const [id, patch] of Object.entries(newer.calendars)) {
    out.calendars[id] = { ...out.calendars[id], ...patch };
  }
  for (const c of COLLECTIONS) {
    for (const [id, item] of Object.entries(newer[c].upsert)) {
      out[c].upsert[id] = item;
      delete out[c].delete[id];
    }
    for (const id of Object.keys(newer[c].delete)) {
      delete out[c].upsert[id];
      out[c].delete[id] = true;
    }
  }
  return out;
}

let pending = emptyPending();
let inFlight = null; // promise of the current request
let inFlightBatch = null; // what that request carries, kept for persistence
let timer = null;
let retryTimer = null;
let retryStep = 0;
let status = 'idle'; // idle | pending | saving | error
const handlers = { onStatus: () => {}, onRejected: () => {}, onSkipped: () => {} };

export function configure(h) {
  Object.assign(handlers, h);
}
export const getStatus = () => status;
function setStatus(s) {
  if (s === status) return;
  status = s;
  handlers.onStatus(s);
}

function isEmpty(p) {
  return (
    Object.keys(p.settings).length === 0 &&
    Object.keys(p.calendars).length === 0 &&
    COLLECTIONS.every((c) => Object.keys(p[c].upsert).length === 0 && Object.keys(p[c].delete).length === 0)
  );
}
export const hasPending = () => !isEmpty(pending) || inFlightBatch !== null;

function persist() {
  try {
    const all = inFlightBatch ? mergePending(inFlightBatch, pending) : pending;
    if (isEmpty(all)) localStorage.removeItem(STORAGE.pending);
    else localStorage.setItem(STORAGE.pending, JSON.stringify(all));
  } catch {
    /* storage full or unavailable: in-memory queue still works */
  }
}

// Called once after login/page load: pick up edits a previous page didn't manage to send.
export function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE.pending);
    if (!raw) return;
    const stored = JSON.parse(raw);
    pending = mergePending(emptyPending(), { ...emptyPending(), ...stored });
  } catch {
    pending = emptyPending();
  }
}

export function reset() {
  clearTimeout(timer);
  clearTimeout(retryTimer);
  pending = emptyPending();
  inFlightBatch = null;
  retryStep = 0;
  try {
    localStorage.removeItem(STORAGE.pending);
  } catch {
    /* ignore */
  }
  setStatus('idle');
}

function schedule() {
  persist();
  setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(() => flush(), SYNC_DEBOUNCE_MS);
}

export const queue = {
  settings(patch) {
    Object.assign(pending.settings, patch);
    schedule();
  },
  calendar(id, patch) {
    pending.calendars[id] = { ...pending.calendars[id], ...patch, id };
    schedule();
  },
  upsert(collection, item) {
    pending[collection].upsert[item.id] = item;
    delete pending[collection].delete[item.id];
    schedule();
  },
  remove(collection, id) {
    delete pending[collection].upsert[id];
    pending[collection].delete[id] = true;
    schedule();
  },
};

function buildBody(p) {
  const body = {};
  if (Object.keys(p.settings).length) body.settings = p.settings;
  const cals = Object.values(p.calendars);
  if (cals.length) body.calendars = cals;
  for (const c of COLLECTIONS) {
    const upsert = Object.values(p[c].upsert);
    const del = Object.keys(p[c].delete);
    if (upsert.length || del.length) {
      body[c] = {};
      if (upsert.length) body[c].upsert = upsert;
      if (del.length) body[c].delete = del;
    }
  }
  return body;
}

// Remove items the server named in a 422 so one bad item can't block every later save.
function dropIds(batch, ids) {
  let dropped = 0;
  const set = new Set(ids);
  for (const c of COLLECTIONS) {
    for (const id of Object.keys(batch[c].upsert)) {
      if (set.has(id)) {
        delete batch[c].upsert[id];
        dropped++;
      }
    }
    for (const id of Object.keys(batch[c].delete)) {
      if (set.has(id)) {
        delete batch[c].delete[id];
        dropped++;
      }
    }
  }
  for (const id of Object.keys(batch.calendars)) {
    if (set.has(id)) {
      delete batch.calendars[id];
      dropped++;
    }
  }
  if (set.has('settings') && Object.keys(batch.settings).length) {
    batch.settings = {};
    dropped++;
  }
  return dropped;
}

async function send(keepalive) {
  const batch = pending;
  pending = emptyPending();
  inFlightBatch = batch;
  setStatus('saving');
  const body = buildBody(batch);
  const useKeepalive = keepalive && JSON.stringify(body).length < KEEPALIVE_MAX_BYTES;
  try {
    const res = await api.patchSync(body, { keepalive: useKeepalive });
    inFlightBatch = null;
    retryStep = 0;
    persist();
    setStatus(isEmpty(pending) ? 'idle' : 'pending');
    if (res && Array.isArray(res.skipped) && res.skipped.length) handlers.onSkipped(res.skipped);
    return { ok: true };
  } catch (err) {
    inFlightBatch = null;
    if (err instanceof api.ApiError && err.status === 401) {
      // Session is gone; the 401 handler resets us and switches to guest mode.
      return { ok: false, err };
    }
    if (err instanceof api.ApiError && err.status === 422) {
      const dropped = dropIds(batch, err.ids);
      if (dropped > 0) {
        pending = mergePending(batch, pending);
        persist();
        handlers.onRejected(err, { dropped });
        setStatus(isEmpty(pending) ? 'idle' : 'pending');
        if (!isEmpty(pending)) schedule();
      } else {
        // We can't tell which item is at fault. Discard this batch so it can't loop forever;
        // the caller re-reads the server state so the screen matches what was actually saved.
        persist();
        handlers.onRejected(err, { discarded: true });
        setStatus(isEmpty(pending) ? 'idle' : 'pending');
      }
      return { ok: false, err };
    }
    // Network trouble, 5xx, 429, or other 4xx we can't act on: keep the batch and retry.
    pending = mergePending(batch, pending);
    persist();
    setStatus('error');
    const fatal4xx = err instanceof api.ApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
    if (!fatal4xx) {
      clearTimeout(retryTimer);
      const wait = err.retryAfter != null ? err.retryAfter * 1000 : Math.min(3000 * 2 ** retryStep, 60000);
      retryStep++;
      retryTimer = setTimeout(() => flush(), wait);
    }
    return { ok: false, err };
  }
}

// Send everything pending right now. Never throws; check `.ok`.
export async function flush({ keepalive = false } = {}) {
  while (inFlight) await inFlight.catch(() => {});
  if (isEmpty(pending)) return { ok: true };
  clearTimeout(timer);
  inFlight = send(keepalive);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
