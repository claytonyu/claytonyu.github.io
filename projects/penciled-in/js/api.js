// Thin fetch wrapper for the Penciled In backend (FRONTEND_GUIDE.md sections 4 to 6).
import { BACKEND_URL, REQUEST_TIMEOUT_MS, SLOW_REQUEST_MS } from './config.js';
import { getToken } from './auth.js';

export class ApiError extends Error {
  constructor(status, detail, extra = {}) {
    super(detail);
    this.name = 'ApiError';
    this.status = status; // 0 = network failure or timeout
    this.detail = detail;
    this.ids = extra.ids || [];
    this.errors = extra.errors || [];
    this.retryAfter = extra.retryAfter ?? null;
  }
}

const handlers = { onUnauthorized: () => {}, onSlow: () => {} };
export function setHandlers(h) {
  Object.assign(handlers, h);
}

// "Waking up the server" detection: any request still pending after a couple of seconds.
let pending = 0;
let slowTimer = null;
let slowShown = false;
function requestStarted() {
  pending++;
  if (pending === 1) {
    slowTimer = setTimeout(() => {
      slowShown = true;
      handlers.onSlow(true);
    }, SLOW_REQUEST_MS);
  }
}
function requestFinished() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    clearTimeout(slowTimer);
    if (slowShown) {
      slowShown = false;
      handlers.onSlow(false);
    }
  }
}

async function request(method, path, { body, keepalive = false, silent401 = false, quiet = false } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // keepalive requests are fire-and-forget on page hide, and `quiet` ones are background
  // fetches; neither should trigger the "waking up the server" banner.
  const tracked = !keepalive && !quiet;
  if (tracked) requestStarted();
  let res;
  try {
    res = await fetch(BACKEND_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    throw new ApiError(
      0,
      timedOut
        ? 'The server took too long to respond.'
        : "Couldn't reach the server. Check your connection, or it may still be waking up.",
    );
  } finally {
    clearTimeout(timeout);
    if (tracked) requestFinished();
  }

  let data = null;
  if (res.status !== 204) {
    const type = res.headers.get('content-type') || '';
    try {
      data = type.includes('json') ? await res.json() : await res.text();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
    const detail =
      data && typeof data === 'object' && typeof data.detail === 'string'
        ? data.detail
        : `Request failed (${res.status}).`;
    const err = new ApiError(res.status, detail, {
      ids: data && Array.isArray(data.ids) ? data.ids : [],
      errors: data && Array.isArray(data.errors) ? data.errors : [],
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
    });
    if (res.status === 401 && !silent401) handlers.onUnauthorized(err);
    throw err;
  }
  return data;
}

// Retry 503, network failures, and a single 429 with backoff. Other 4xx are never retried.
export async function withRetry(fn, { tries = 4 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const retryable = err instanceof ApiError && (err.status === 503 || err.status === 0 || err.status === 429);
      if (!retryable || attempt >= tries || (err.status === 429 && attempt > 1)) throw err;
      const wait = err.retryAfter != null ? err.retryAfter * 1000 : Math.min(3000 * 2 ** (attempt - 1), 12000);
      await new Promise((r) => setTimeout(r, Math.min(wait, 30000)));
    }
  }
}

// Wake the server early. Never touches the database, so failures are ignored.
export function ping() {
  fetch(`${BACKEND_URL}/`, { cache: 'no-store' }).catch(() => {});
}

// offsetDays picks which 60 days of Google events come back: centered on today + offsetDays.
export const getState = (syncGoogle = true, offsetDays = 0, opts = {}) =>
  request('GET', `/state?sync_google=${syncGoogle ? 'true' : 'false'}&offset_days=${Math.trunc(offsetDays)}`, opts);
export const patchSync = (body, opts) => request('PATCH', '/sync', { body, ...opts });
export const postSchedule = (body) => request('POST', '/schedule', { body });
export const logout = () => request('DELETE', '/auth/session', { silent401: true });
export const deleteAccount = () => request('DELETE', '/account');

// A message safe to show directly in the UI.
export function describeError(err) {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.status === 422 && err.errors.length) {
    const first = err.errors[0];
    const where = Array.isArray(first.loc) ? first.loc.filter((p) => p !== 'body').join(' › ') : '';
    return `${err.detail}${where ? ` (${where}: ${first.msg})` : ''}`;
  }
  if (err.status === 429) {
    return `Too many requests. Try again${err.retryAfter ? ` in ${err.retryAfter} seconds` : ' in a moment'}.`;
  }
  return err.detail;
}
