// Right-hand sidebar for creating, viewing and editing one task.
// Built on <dialog>.showModal(), which traps focus, makes the page behind it inert and closes on Escape.
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

let current = null; // { dialog, task, controls, snapshot, returnFocus }

export function openTaskSidebar(task = null) {
  closeTaskSidebar();
  const controls = buildControls(task);
  const dialog = el("dialog", { className: "sidebar", "aria-labelledby": "sidebar-title" });
  // Focus goes back by key rather than element: the row may be re-rendered while the sidebar is
  // open, and Safari doesn't focus buttons on click.
  current = { dialog, task, controls, returnFocusKey: task ? `task-${task.id}` : "new-task" };
  current.snapshot = JSON.stringify(readForm());

  dialog.append(
    sidebarHeader(task),
    el("form", { className: "sidebar__body", noValidate: true, onsubmit: onSubmit }, [
      task?.html_url && canvasNotice(task),
      formFields(task, controls),
      el("p", { className: "form-error", role: "alert", id: "task-form-error" }),
      sidebarActions(task, controls),
    ]),
  );
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });

  document.body.append(dialog);
  dialog.showModal();
  controls.title.focus();
}

export function closeTaskSidebar() {
  if (!current) return;
  const { dialog, returnFocusKey } = current;
  current = null;
  dialog.close();
  dialog.remove();
  restoreFocus(returnFocusKey);
}

export function isTaskSidebarDirty() {
  return current !== null && JSON.stringify(readForm()) !== current.snapshot;
}

async function requestClose() {
  if (isTaskSidebarDirty()) {
    const discard = await openModal({
      title: "Discard changes?",
      message: "Your changes to this task haven't been saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true,
    });
    if (!discard) return;
  }
  closeTaskSidebar();
}

// ----- Building the form -----

function buildControls(task) {
  return {
    title: el("input", { id: "task-title", className: "input", required: true, value: task?.title ?? "" }),
    description: el("textarea", { id: "task-description", className: "input", rows: 5, value: task?.description ?? "" }),
    due: el("input", { id: "task-due", className: "input", type: "datetime-local", value: toLocalInputValue(task?.due_at) }),
    recurrence: selectControl({
      id: "task-recurrence",
      options: Object.entries(RECURRENCE_LABELS),
      value: task?.recurrence ?? "none",
    }),
    course: selectControl({ id: "task-course", options: courseOptions(), value: String(task?.course_id ?? "") }),
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
