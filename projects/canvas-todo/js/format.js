// Display and conversion helpers for dates and task fields.
const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

export const RECURRENCE_LABELS = {
  none: "Doesn't repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function formatDateTime(iso) {
  return DATE_TIME.format(new Date(iso));
}

export function isOverdue(task) {
  return !task.completed && task.due_at !== null && Date.parse(task.due_at) < Date.now();
}

// ISO (UTC) → value for <input type="datetime-local">, in the user's local time.
export function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// datetime-local values have no offset, so Date parses them as local time.
export function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

// Message for completing a repeating task, which the server rolls forward instead of finishing.
export function completionMessage(updatedTask) {
  return updatedTask.recurrence !== "none" && updatedTask.due_at
    ? `Done. "${updatedTask.title}" is next due ${formatDateTime(updatedTask.due_at)}.`
    : `Marked "${updatedTask.title}" done.`;
}
