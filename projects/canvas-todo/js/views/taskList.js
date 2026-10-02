// Task List (main view): toolbar for layout/sort/filter/search, then tasks as one list or grouped
// by course. Shift-click (or Shift+Enter) on tasks selects several for bulk delete.
// The toolbar is built once on mount; update() re-renders only the results, so typing in the
// search box never loses focus.
import { el, focusKeyOf, restoreFocus } from "../dom.js";
import { state, emit } from "../state.js";
import { updateTasks } from "../actions.js";
import { handleError } from "../errors.js";
import { toast } from "../notify.js";
import { createSearchInput } from "../search.js";
import { selectField } from "../fields.js";
import { formatDateTime, isOverdue, completionMessage, RECURRENCE_LABELS } from "../format.js";
import { courseNameFor, filterTasks, sortTasks, groupTasks } from "../taskQuery.js";
import { openTaskSidebar } from "./taskSidebar.js";
import { confirmAndDeleteTasks } from "./confirmDelete.js";

const selected = new Set(); // ids of tasks selected for bulk actions
let refs = null; // { results, selectionBar, courseSortField }

export function mount(root) {
  selected.clear();
  refs = {
    results: el("div", { className: "results", "aria-live": "polite", "aria-busy": "false" }),
    selectionBar: el("div", { className: "selection-bar", hidden: true }),
    courseSortField: courseSortControl(),
  };
  root.append(
    el("header", { className: "view-header" }, [
      el("h1", { className: "view-title", tabIndex: -1 }, "Tasks"),
      el("div", { className: "view-header__actions" }, [
        el("button", {
          type: "button",
          className: "button button--primary",
          dataset: { focusKey: "new-task" },
          onclick: () => openTaskSidebar(),
        }, "+ New Task"),
      ]),
    ]),
    toolbar(),
    el("p", { className: "hint" }, "Tip: hold Shift while clicking tasks (or press Shift+Enter) to select several."),
    refs.selectionBar,
    refs.results,
  );
  update();
}

export function update() {
  const focusKey = focusKeyOf(document.activeElement);
  pruneSelection();
  refs.courseSortField.hidden = state.taskView.layout !== "grouped";
  refs.selectionBar.replaceChildren(...selectionBarContent());
  refs.selectionBar.hidden = selected.size === 0;
  refs.results.setAttribute("aria-busy", String(!state.tasksLoaded));
  refs.results.replaceChildren(results());
  restoreFocus(focusKey);
}

// ----- Toolbar -----

function setView(key, value) {
  state.taskView[key] = value;
  emit();
}

function toolbar() {
  const view = state.taskView;
  return el("div", { className: "toolbar", role: "group", "aria-label": "View options" }, [
    createSearchInput({
      id: "task-search",
      label: "Search tasks or courses",
      value: view.search,
      onSearch: (value) => setView("search", value),
    }),
    selectField({
      id: "task-layout",
      label: "View",
      options: [["list", "List"], ["grouped", "By course"]],
      value: view.layout,
      onChange: (value) => setView("layout", value),
    }),
    selectField({
      id: "task-sort",
      label: "Sort tasks",
      options: [["due", "Due date"], ["title", "Title"], ["newest", "Newest first"]],
      value: view.sort,
      onChange: (value) => setView("sort", value),
    }),
    refs.courseSortField,
    el("div", { className: "checkbox-field" }, [
      el("input", {
        id: "task-show-completed",
        type: "checkbox",
        checked: view.showCompleted,
        onchange: (event) => setView("showCompleted", event.target.checked),
      }),
      el("label", { htmlFor: "task-show-completed" }, "Show completed"),
    ]),
  ]);
}

function courseSortControl() {
  return selectField({
    id: "course-sort",
    label: "Sort courses",
    options: [["name", "Name"], ["soonest", "Soonest due"]],
    value: state.taskView.courseSort,
    onChange: (value) => setView("courseSort", value),
  });
}

// ----- Selection -----

function pruneSelection() {
  const ids = new Set(state.tasks.map((task) => task.id));
  [...selected].filter((id) => !ids.has(id)).forEach((id) => selected.delete(id));
}

function toggleSelected(task) {
  if (selected.has(task.id)) selected.delete(task.id);
  else selected.add(task.id);
  update();
}

function selectionBarContent() {
  if (selected.size === 0) return [];
  const tasks = state.tasks.filter((task) => selected.has(task.id));
  return [
    el("span", { role: "status" }, `${selected.size} selected`),
    el("button", {
      type: "button",
      className: "button button--danger button--small",
      dataset: { focusKey: "bulk-delete" },
      onclick: () => confirmAndDeleteTasks(tasks),
    }, "Delete selected"),
    el("button", {
      type: "button",
      className: "button button--small",
      onclick: () => { selected.clear(); update(); },
    }, "Clear selection"),
  ];
}

// ----- Results -----

function results() {
  if (!state.tasksLoaded) return el("p", { className: "empty" }, "Loading tasks…");
  const view = state.taskView;
  const nameOf = (courseId) => courseNameFor(state.courses, courseId);
  const visible = sortTasks(filterTasks(state.tasks, view, nameOf), view.sort);

  if (state.tasks.length === 0) return emptyState("No tasks yet. Create one, or import assignments from Canvas.");
  if (view.layout === "list") {
    return visible.length ? taskList(visible, { showCourse: true }) : emptyState(noMatchesMessage());
  }
  const groups = groupTasks(visible, state.courses, view.courseSort, nameOf)
    .filter((group) => group.tasks.length > 0 || view.search.trim() === "");
  return groups.length ? el("div", { className: "groups" }, groups.map(courseGroup)) : emptyState(noMatchesMessage());
}

function noMatchesMessage() {
  return state.taskView.search.trim() ? "No tasks match your search." : "Nothing left to do. Nice work.";
}

function emptyState(message) {
  return el("p", { className: "empty" }, message);
}

function courseGroup(group) {
  const headingId = `group-${group.id ?? "none"}`;
  return el("section", { className: "course-group", "aria-labelledby": headingId }, [
    el("h2", { id: headingId, className: "course-group__title" }, [
      group.name,
      el("span", { className: "course-group__count" }, ` ${group.tasks.length}`),
    ]),
    group.tasks.length
      ? taskList(group.tasks, { showCourse: false })
      : el("p", { className: "empty empty--small" }, "No tasks."),
  ]);
}

function taskList(tasks, options) {
  return el("ul", { className: "task-list" }, tasks.map((task) => taskRow(task, options)));
}

function taskRow(task, { showCourse }) {
  const isSelected = selected.has(task.id);
  const classes = ["task-row", task.completed && "task-row--done", isSelected && "task-row--selected"];
  return el("li", { className: classes.filter(Boolean).join(" ") }, [
    completeCheckbox(task),
    el("button", {
      type: "button",
      className: "task-row__main",
      dataset: { focusKey: `task-${task.id}` },
      onclick: (event) => (event.shiftKey ? toggleSelected(task) : openTaskSidebar(task)),
      onkeydown: (event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          toggleSelected(task);
        }
      },
    }, [
      el("span", { className: "task-row__title" }, task.title),
      isSelected && el("span", { className: "visually-hidden" }, " (selected)"),
      taskMeta(task, showCourse),
    ]),
  ]);
}

function completeCheckbox(task) {
  const id = `complete-${task.id}`;
  return el("span", { className: "task-row__check" }, [
    el("input", {
      id,
      type: "checkbox",
      checked: task.completed,
      dataset: { focusKey: id },
      onchange: (event) => toggleCompleted(task, event.target),
    }),
    el("label", { htmlFor: id, className: "visually-hidden" }, `Mark “${task.title}” ${task.completed ? "not done" : "done"}`),
  ]);
}

function taskMeta(task, showCourse) {
  const overdue = isOverdue(task);
  return el("span", { className: "task-row__meta" }, [
    task.due_at && el("span", { className: overdue ? "due due--overdue" : "due" },
      overdue ? `Overdue · ${formatDateTime(task.due_at)}` : `Due ${formatDateTime(task.due_at)}`),
    showCourse && el("span", { className: "task-row__course" }, courseNameFor(state.courses, task.course_id)),
    task.recurrence !== "none" && el("span", { className: "badge" }, RECURRENCE_LABELS[task.recurrence]),
    task.html_url && el("span", { className: "badge badge--canvas" }, "Canvas"),
  ]);
}

// The server decides the result: a repeating task comes back not completed, with a new due date.
async function toggleCompleted(task, checkbox) {
  checkbox.disabled = true;
  try {
    const [updated] = await updateTasks([{ id: task.id, completed: !task.completed }]);
    toast(task.completed ? `Marked "${updated.title}" not done.` : completionMessage(updated));
  } catch (error) {
    checkbox.checked = task.completed;
    handleError(error);
  } finally {
    checkbox.disabled = false;
  }
}
