// Canvas sync and import decisions.
import * as api from "./api.js";
import { state, emit, upsert } from "./state.js";
import { reloadData, loadTasks } from "./actions.js";
import { handleError } from "./errors.js";
import { showBanner, hideBanner } from "./notify.js";

let syncInFlight = null;

// Pulls from Canvas, then reloads tasks/courses/assignments, since sync can add pending items and
// update the due dates and courses of imported tasks. Concurrent calls share one request.
export function runSync() {
  syncInFlight ??= sync().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

// Page changes only sync when something calls for it (new session, or the last sync failed).
export function syncIfNeeded() {
  if (state.syncNeeded) runSync();
}

async function sync() {
  state.syncing = true;
  emit();
  showBanner("sync", "Syncing with Canvas… this can take up to a minute if the server was asleep.");
  try {
    await api.syncCanvas();
    await reloadData();
    state.lastSyncedAt = new Date();
    state.syncNeeded = false;
  } catch (error) {
    handleError(error, { retry: runSync });
  } finally {
    state.syncing = false;
    hideBanner("sync");
    emit();
  }
}

// Keeping a course only takes effect for assignments on the next sync, so sync right away.
export async function setCourseStatus(courses, status) {
  // Not awaited: sync can be slow and reports its own progress and errors.
  upsert("courses", await api.updateCourses(courses.map(({ id }) => ({ id, status }))));
  if (status === "kept") runSync();
}

// Keeping an assignment creates its task on the server immediately; fetch it for the Task List.
export async function setAssignmentStatus(assignments, status) {
  upsert("assignments", await api.updateAssignments(assignments.map(({ id }) => ({ id, status }))));
  if (status === "kept") await loadTasks();
}

// Pending courses, plus pending assignments in kept courses (the ones sync will offer).
export function pendingCount() {
  const kept = new Set(state.courses.filter((course) => course.status === "kept").map((course) => course.id));
  return state.courses.filter((course) => course.status === "pending").length
    + state.assignments.filter((item) => item.status === "pending" && kept.has(item.course_id)).length;
}
