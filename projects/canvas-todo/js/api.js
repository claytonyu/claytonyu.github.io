// Central API module: one function per backend endpoint. Views never call fetch directly.
// 401 and 403 canvas_token_required are routed to global handlers here; everything else is thrown
// as an ApiError for errors.js / the calling form to display.
import { BACKEND_URL } from "./config.js";
import { getToken } from "./session.js";
import { showBanner, hideBanner } from "./notify.js";

const SLOW_REQUEST_MS = 5000;

export class ApiError extends Error {
  constructor(status, body, handled = false) {
    super(body?.message || body?.error || `Request failed (${status}).`);
    this.status = status;
    this.code = body?.error;
    this.handled = handled; // true when a global handler already dealt with it
  }
}

const authHandlers = { onUnauthorized() {}, onCanvasTokenRequired() {} };

export function setAuthHandlers(handlers) {
  Object.assign(authHandlers, handlers);
}

// Shows one shared "server waking up" banner while any request is slow (Render cold starts).
let slowRequests = 0;

function trackSlow(promise) {
  let isSlow = false;
  const timer = setTimeout(() => {
    isSlow = true;
    slowRequests += 1;
    showBanner("slow", "Still working… the server may be waking up, which can take up to a minute.");
  }, SLOW_REQUEST_MS);
  return promise.finally(() => {
    clearTimeout(timer);
    if (isSlow) slowRequests -= 1;
    if (isSlow && slowRequests === 0) hideBanner("slow");
  });
}

async function request(method, path, { body, auth = true, slowNotice = true } = {}) {
  const token = getToken();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${token}`;

  const pending = fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let response;
  try {
    response = await (slowNotice ? trackSlow(pending) : pending);
  } catch {
    throw new ApiError(0, { error: "Couldn't reach the server. Check your connection and try again." });
  }

  // The user signed out (or in as someone else) while this was in flight: drop the result.
  if (auth && getToken() !== token) throw new ApiError(0, null, true);

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  throw routeError(new ApiError(response.status, data), auth);
}

function routeError(error, auth) {
  if (error.status === 401 && auth) {
    error.handled = true;
    authHandlers.onUnauthorized();
  } else if (error.status === 403 && error.code === "canvas_token_required") {
    error.handled = true;
    authHandlers.onCanvasTokenRequired();
  }
  return error;
}

// Health / auth
export const getHealth = () => request("GET", "/health", { auth: false, slowNotice: false });
// The login form shows its own cold-start message.
export const login = (canvasToken) =>
  request("POST", "/auth/token", { body: { canvas_token: canvasToken }, auth: false, slowNotice: false });
export const getMe = () => request("GET", "/auth/me");
export const logout = () => request("POST", "/auth/logout");
export const disconnectCanvas = () => request("DELETE", "/auth/canvas");
export const deleteAccount = () => request("DELETE", "/auth/account");

// Tasks (bulk endpoints: send a list of one for a single task)
export const getTasks = () => request("GET", "/tasks");
export const createTasks = (tasks) => request("POST", "/tasks", { body: tasks });
export const updateTasks = (changes) => request("PATCH", "/tasks", { body: changes });
export const deleteTasks = (ids) => request("DELETE", "/tasks", { body: { ids } });

// Canvas. Sync has its own progress banner, so it skips the generic slow notice.
export const syncCanvas = () => request("POST", "/canvas/sync", { slowNotice: false });
export const getCourses = () => request("GET", "/canvas/courses");
export const getAssignments = () => request("GET", "/canvas/assignments");
export const updateCourses = (changes) => request("PATCH", "/canvas/courses", { body: changes });
export const updateAssignments = (changes) => request("PATCH", "/canvas/assignments", { body: changes });
