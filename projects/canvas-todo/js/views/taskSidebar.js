// Right-hand sidebar for creating, viewing and editing one task.
// Non-modal: it sits beside the list (which narrows to make room) and never blocks the page.
// Focus moves into it on open, Escape closes it, and focus returns to the task on close.
import { el, isHttpsUrl, restoreFocus } from "../dom.js";
import { state } from "../state.js";
import { createTask, updateTasks } from "../actions.js";
import { handleError } from "../errors.js";
import { toast } from "../notify.js";
import { openModal } from "../modal.js";
import { field, setFieldError, selectControl } from "../fields.js";
import { confirmAndDeleteTasks } from "./confirmDelete.js";
import { courseNameFor } from "../taskQuery.js";
import {
  RECURRENCE_LABELS, formatDateTime, toLocalInputValue, fromLocalInputValue, completionMessage,
} from "../format.js";

let current = null; // { panel, task, controls, snapshot, returnFocusKey }

// task: the task to edit, or null to create one.
// options.courseId pre-fills the course for a new task; options.returnFocusKey is the control
// to refocus on close (by key rather than element, since the row may re-render while open and
// Safari doesn't focus buttons on click).
export async function openTaskSidebar(task = null, { courseId = null, returnFocusKey = "new-task" } = {}) {
  if (!(await confirmDiscardIfDirty())) return;
  closeTaskSidebar({ restore: false });

  const controls = buildControls(task, courseId);
  const panel = el("aside", {
    className: "sidebar",
    role: "dialog",
    "aria-labelledby": "sidebar-title",
    onkeydown: (event) => {
      if (event.key === "Escape") requestClose();
    },
  });
  current = { panel, task, controls, returnFocusKey: task ? `task-${task.id}` : returnFocusKey };
  current.snapshot = JSON.stringify(readForm());

  panel.append(
    sidebarHeader(task),
    el("form", { className: "sidebar__body", noValidate: true, onsubmit: onSubmit }, [
      task?.html_url && canvasNotice(task),
      formFields(task, controls),
      el("p", { className: "form-error", role: "alert", id: "task-form-error" }),
      sidebarActions(task, controls),
    ]),
  );

  document.querySelector(".app").append(panel);
  controls.title.focus({ preventScroll: true });
}

export function closeTaskSidebar({ restore = true } = {}) {
  if (!current) return;
  const { panel, returnFocusKey } = current;
  current = null;
  panel.remove();
  if (restore) restoreFocus(returnFocusKey);
}

export function isTaskSidebarDirty() {
  return current !== null && JSON.stringify(readForm()) !== current.snapshot;
}

// Resolves true when it's fine to throw away the open form.
async function confirmDiscardIfDirty() {
  if (!isTaskSidebarDirty()) return true;
  return openModal({
    title: "Discard changes?",
    message: "Your changes to this task haven't been saved.",
    confirmLabel: "Discard",
    cancelLabel: "Keep editing",
    danger: true,
  });
}

async function requestClose() {
  if (await confirmDiscardIfDirty()) closeTaskSidebar();
}

// ----- Building the form -----

function buildControls(task, courseId) {
  return {
    title: el("input", { id: "task-title", className: "input", required: true, value: task?.title ?? "" }),
    description: el("textarea", { id: "task-description", className: "input", rows: 5, value: task?.description ?? "" }),
    due: el("input", { id: "task-due", className: "input", type: "datetime-local", value: toLocalInputValue(task?.due_at) }),
    recurrence: selectControl({
      id: "task-recurrence",
      options: Object.entries(RECURRENCE_LABELS),
      value: task?.recurrence ?? "none",
    }),
    course: selectControl({ id: "task-course", options: courseOptions(), value: String((task ? task.course_id : courseId) ?? "") }),
    completed: el("input", { id: "task-completed", type: "checkbox", checked: task?.completed ?? false }),
    save: el("button", { type: "submit", className: "button button--primary" }, task ? "Save changes" : "Create task"),
  };
}

// Manual tasks may use any of the user's courses, whatever its import status.
function courseOptions() {
  const sorted = [...state.courses].sort((a, b) => a.name.localeCompare(b.name));
  return [["", "No course"], ...sorted.map((course) => [String(course.id), course.name])];
}

function sidebarHeader(task) {
  return el("div", { className: "sidebar__header" }, [
    el("h2", { id: "sidebar-title", className: "sidebar__title" }, task ? "Task details" : "New task"),
    el("button", { type: "button", className: "icon-button", "aria-label": "Close", onclick: requestClose }, "×"),
  ]);
}

function canvasNotice(task) {
  return el("div", { className: "canvas-notice" }, [
    el("span", { className: "badge badge--canvas" }, "Canvas"),
    el("p", {}, "Imported from Canvas. The due date and course are kept in sync with Canvas, so they can't be edited here."),
    isHttpsUrl(task.html_url) && el("a", {
      href: task.html_url, target: "_blank", rel: "noreferrer", className: "link",
    }, ["Open assignment in Canvas", el("span", { className: "visually-hidden" }, " (opens in a new tab)")]),
  ]);
}

function formFields(task, controls) {
  const isCanvas = Boolean(task?.html_url);
  return [
    field({ label: "Title", control: controls.title }),
    field({ label: "Description", control: controls.description }),
    isCanvas ? readOnlyField("Due", task.due_at ? formatDateTime(task.due_at) : "No due date")
      : field({ label: "Due", control: controls.due, hint: "Leave empty for no due date." }),
    field({ label: "Repeats", control: controls.recurrence, hint: "Repeating tasks need a due date. Completing one moves it to the next due date." }),
    isCanvas ? readOnlyField("Course", courseNameFor(state.courses, task.course_id))
      : field({ label: "Course", control: controls.course }),
    el("div", { className: "checkbox-field" }, [
      controls.completed,
      el("label", { htmlFor: controls.completed.id }, "Completed"),
    ]),
  ];
}

function readOnlyField(label, value) {
  return el("div", { className: "field" }, [
    el("p", { className: "field__label" }, label),
    el("p", { className: "field__readonly" }, value),
  ]);
}

function sidebarActions(task, controls) {
  return el("div", { className: "sidebar__actions" }, [
    controls.save,
    el("button", { type: "button", className: "button", onclick: requestClose }, "Cancel"),
    task && el("button", {
      type: "button",
      className: "button button--danger-outline sidebar__delete",
      onclick: async () => {
        const deleted = await confirmAndDeleteTasks([task]);
        if (deleted) closeTaskSidebar();
      },
    }, "Delete"),
  ]);
}

// ----- Reading, validating and saving -----

// Canvas-managed fields (due_at, course_id) are left out for imported tasks.
function readForm() {
  const { task, controls } = current;
  const fields = {
    title: controls.title.value.trim(),
    description: controls.description.value,
    recurrence: controls.recurrence.value,
    completed: controls.completed.checked,
  };
  if (!task?.html_url) {
    fields.due_at = fromLocalInputValue(controls.due.value);
    fields.course_id = controls.course.value === "" ? null : Number(controls.course.value);
  }
  return fields;
}

function validate(fields) {
  const { task, controls } = current;
  const dueAt = task?.html_url ? task.due_at : fields.due_at;
  const errors = [
    [controls.title, fields.title === "" ? "Give the task a title." : null],
    [controls.recurrence, fields.recurrence !== "none" && !dueAt ? "Repeating tasks need a due date." : null],
  ];
  errors.forEach(([control, message]) => setFieldError(control, message));
  const firstInvalid = errors.find(([, message]) => message);
  firstInvalid?.[0].focus();
  return !firstInvalid;
}

// Only fields that differ from the task are sent. Due dates are compared as instants, since the
// form's value is minute-precision ISO while the server's has its own formatting.
function changedFields(task, fields) {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => (key === "due_at"
    ? !sameInstant(task.due_at, value)
    : task[key] !== value)));
}

function sameInstant(before, after) {
  return toLocalInputValue(before) === toLocalInputValue(after);
}

async function onSubmit(event) {
  event.preventDefault();
  const fields = readForm();
  if (!validate(fields)) return;

  const { task, controls } = current;
  const formError = document.getElementById("task-form-error");
  formError.textContent = "";
  controls.save.disabled = true;
  try {
    toast(await saveTask(task, fields));
    closeTaskSidebar();
  } catch (error) {
    handleError(error, { onInline: (message) => { formError.textContent = message; } });
  } finally {
    controls.save.disabled = false;
  }
}

// Returns the confirmation message to show.
async function saveTask(task, fields) {
  if (!task) {
    await createTask(fields);
    return `Created "${fields.title}".`;
  }
  const changes = changedFields(task, fields);
  if (Object.keys(changes).length === 0) return "No changes to save.";
  const [updated] = await updateTasks([{ id: task.id, ...changes }]);
  return changes.completed ? completionMessage(updated) : "Changes saved.";
}
