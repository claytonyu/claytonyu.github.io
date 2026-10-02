// Single in-memory app state. Views read from it; every mutation calls emit() so the active view
// re-renders. Lists are patched from server responses rather than refetched or guessed.
export const state = createInitialState();

function createInitialState() {
  return {
    user: null,
    tasks: [],
    courses: [],
    assignments: [],
    tasksLoaded: false,
    canvasLoaded: false,
    syncing: false,
    lastSyncedAt: null,
    taskView: { layout: "list", sort: "due", courseSort: "name", showCompleted: false, search: "" },
    importView: { search: "", showDecided: false },
  };
}

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit() {
  listeners.forEach((listener) => listener());
}

export function resetState() {
  Object.assign(state, createInitialState());
  emit();
}

// Insert or replace items by id in one of the state lists ("tasks", "courses", "assignments").
export function upsert(listName, items) {
  const byId = new Map(state[listName].map((item) => [item.id, item]));
  items.forEach((item) => byId.set(item.id, item));
  state[listName] = [...byId.values()];
  emit();
}

export function removeTasks(ids) {
  const removed = new Set(ids);
  state.tasks = state.tasks.filter((task) => !removed.has(task.id));
  emit();
}
