// Orchestrates API calls and writes their results into app state.
import * as api from "./api.js";
import { state, emit, upsert, removeTasks } from "./state.js";

export async function loadUser() {
  state.user = await api.getMe();
  emit();
}

export async function loadTasks() {
  state.tasks = await api.getTasks();
  state.tasksLoaded = true;
  emit();
}

export async function loadCanvasData() {
  const [courses, assignments] = await Promise.all([api.getCourses(), api.getAssignments()]);
  Object.assign(state, { courses, assignments, canvasLoaded: true });
  emit();
}

export function reloadData() {
  return Promise.all([loadTasks(), loadCanvasData()]);
}

// Loads whatever this session hasn't fetched yet. Safe to call on every page change.
export async function loadMissingData() {
  if (!state.user) await loadUser();
  await Promise.all([
    !state.tasksLoaded && loadTasks(),
    !state.canvasLoaded && loadCanvasData(),
  ]);
}

export async function createTask(fields) {
  const created = await api.createTasks([fields]);
  upsert("tasks", created);
  return created[0];
}

// Returns the server's version of each task, which matters for repeating tasks:
// completing one comes back with completed=false and due_at moved forward.
export async function updateTasks(changes) {
  const updated = await api.updateTasks(changes);
  upsert("tasks", updated);
  return updated;
}

export async function deleteTasks(tasks) {
  await api.deleteTasks(tasks.map((task) => task.id));
  removeTasks(tasks.map((task) => task.id));
  // Deleting a Canvas-imported task marks its assignment ignored on the server.
  if (tasks.some((task) => task.html_url)) await loadCanvasData();
}
