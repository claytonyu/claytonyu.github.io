// Canvas Import: decide which courses to sync and which assignments to import as tasks.
// New (pending) items float to the top with a gold highlight. Already-decided assignments are
// hidden unless "Show decided assignments" is ticked, and can be flipped with their checkbox.
import { el, focusKeyOf, restoreFocus } from "../dom.js";
import { state, emit } from "../state.js";
import { setCourseStatus, setAssignmentStatus } from "../canvas.js";
import { handleError } from "../errors.js";
import { toast } from "../notify.js";
import { createSearchInput, matchesQuery } from "../search.js";
import { formatDateTime } from "../format.js";
import { createSyncControl, refreshSyncControl } from "./syncButton.js";

const STATUS_ORDER = { pending: 0, kept: 1, ignored: 2 };
let refs = null; // { results, syncControl }
let busy = false; // a decision request is in flight

export function mount(root) {
  refs = { results: el("div", { className: "results" }), syncControl: createSyncControl() };
  root.append(
    el("header", { className: "view-header" }, [
      el("h1", { className: "view-title", tabIndex: -1 }, "Canvas Import"),
      el("div", { className: "view-header__actions" }, [refs.syncControl]),
    ]),
    el("p", { className: "hint" }, "Keep a course to see its assignments, then keep the assignments you want as tasks. New items are highlighted; you can leave them undecided."),
    toolbar(),
    refs.results,
  );
  update();
}

export function update() {
  const focusKey = focusKeyOf(document.activeElement);
  refreshSyncControl(refs.syncControl);
  refs.results.setAttribute("aria-busy", String(!state.canvasLoaded || state.syncing));
  refs.results.replaceChildren(results());
  restoreFocus(focusKey);
}

function toolbar() {
  const view = state.importView;
  return el("div", { className: "toolbar", role: "group", "aria-label": "Import options" }, [
    createSearchInput({
      id: "import-search",
      label: "Search courses or assignments",
      value: view.search,
      onSearch: (value) => { view.search = value; emit(); },
    }),
    el("div", { className: "checkbox-field" }, [
      el("input", {
        id: "import-show-decided",
        type: "checkbox",
        checked: view.showDecided,
        onchange: (event) => { view.showDecided = event.target.checked; emit(); },
      }),
      el("label", { htmlFor: "import-show-decided" }, "Show decided assignments"),
    ]),
  ]);
}

// ----- Decisions -----

async function decide(action, message, focusKey) {
  busy = true;
  update();
  try {
    await action();
    toast(message);
  } catch (error) {
    handleError(error);
  } finally {
    busy = false;
    update();
    restoreFocus(focusKey);
  }
}

function decideCourse(course, status) {
  const message = status === "kept" ? `Keeping ${course.name}. Fetching its assignments…` : `Ignoring ${course.name}.`;
  decide(() => setCourseStatus([course], status), message, `course-${course.id}-toggle`);
}

function decideAssignments(course, assignments, status) {
  const subject = assignments.length === 1 ? `“${assignments[0].name}”` : `${assignments.length} assignments`;
  const message = status === "kept"
    ? `Imported ${subject} as ${assignments.length === 1 ? "a task" : "tasks"}.`
    : `Ignored ${subject}.`;
  const focusKey = assignments.length === 1 && state.importView.showDecided
    ? `assignment-${assignments[0].id}-toggle`
    : `course-${course.id}`;
  decide(() => setAssignmentStatus(assignments, status), message, focusKey);
}

// ----- Rendering -----

function results() {
  if (!state.canvasLoaded) return empty("Loading courses…");
  if (state.courses.length === 0) {
    return empty(state.syncing ? "Looking for your Canvas courses…" : "No courses yet. Sync to pull in your active Canvas courses.");
  }
  const sections = sortCourses(state.courses).map(courseSection).filter(Boolean);
  return sections.length ? el("div", { className: "groups" }, sections) : empty("No courses or assignments match your search.");
}

function empty(message) {
  return el("p", { className: "empty" }, message);
}

function sortCourses(courses) {
  return [...courses].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
}

function sortAssignments(assignments) {
  const due = (item) => (item.due_at ? Date.parse(item.due_at) : Infinity);
  return [...assignments].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || due(a) - due(b) || a.name.localeCompare(b.name));
}

// A course shows if its name matches the search, or if any of its assignments do (then only those).
function courseSection(course) {
  const query = state.importView.search;
  const courseMatches = matchesQuery(course.name, query);
  const assignments = sortAssignments(state.assignments.filter((item) => item.course_id === course.id
    && (courseMatches || matchesQuery(item.name, query))));
  if (!courseMatches && assignments.length === 0) return null;

  const headingId = `import-course-${course.id}`;
  return el("section", { className: "import-course", "aria-labelledby": headingId }, [
    courseHeader(course, headingId),
    courseBody(course, assignments),
  ]);
}

function courseHeader(course, headingId) {
  const isNew = course.status === "pending";
  return el("div", { className: `import-course__header${isNew ? " is-new" : ""}` }, [
    el("h2", { id: headingId, className: "import-course__title", tabIndex: -1, dataset: { focusKey: `course-${course.id}` } }, [
      course.name,
      isNew && el("span", { className: "badge badge--new" }, "New"),
    ]),
    isNew ? decisionButtons({
      label: course.name,
      keepText: "Keep course",
      onKeep: () => decideCourse(course, "kept"),
      onIgnore: () => decideCourse(course, "ignored"),
    }) : courseToggle(course),
  ]);
}

function courseToggle(course) {
  const id = `course-toggle-${course.id}`;
  return el("div", { className: "checkbox-field" }, [
    el("input", {
      id,
      type: "checkbox",
      checked: course.status === "kept",
      disabled: busy,
      dataset: { focusKey: `course-${course.id}-toggle` },
      onchange: (event) => decideCourse(course, event.target.checked ? "kept" : "ignored"),
    }),
    el("label", { htmlFor: id }, "Sync assignments"),
  ]);
}

function decisionButtons({ label, keepText, onKeep, onIgnore }) {
  return el("div", { className: "decision" }, [
    el("button", { type: "button", className: "button button--small button--primary", disabled: busy, onclick: onKeep },
      [keepText, el("span", { className: "visually-hidden" }, `: ${label}`)]),
    el("button", { type: "button", className: "button button--small", disabled: busy, onclick: onIgnore },
      ["Ignore", el("span", { className: "visually-hidden" }, `: ${label}`)]),
  ]);
}

function courseBody(course, assignments) {
  if (course.status === "pending") return el("p", { className: "import-course__note" }, "Keep this course to see its assignments.");
  if (course.status === "ignored") return el("p", { className: "import-course__note" }, "Ignored. Its assignments aren't synced. Tick “Sync assignments” to bring it back.");

  const pending = assignments.filter((item) => item.status === "pending");
  const decided = assignments.filter((item) => item.status !== "pending");
  const showDecided = state.importView.showDecided;
  if (assignments.length === 0) {
    return el("p", { className: "import-course__note" }, state.syncing ? "Loading assignments…" : "No assignments found.");
  }
  return el("div", { className: "import-course__body" }, [
    pending.length > 1 && bulkBar(course, pending),
    (pending.length > 0 || (showDecided && decided.length > 0)) && el("ul", { className: "assignment-list" }, [
      pending.map((item) => pendingRow(course, item)),
      showDecided && decided.map((item) => decidedRow(course, item)),
    ]),
    !showDecided && decided.length > 0 && el("p", { className: "import-course__note" },
      `${decided.length} decided assignment${decided.length === 1 ? "" : "s"} hidden.`),
  ]);
}

function bulkBar(course, pending) {
  return el("div", { className: "decision decision--bulk" }, [
    el("span", {}, `${pending.length} new`),
    el("button", { type: "button", className: "button button--small", disabled: busy, onclick: () => decideAssignments(course, pending, "kept") },
      ["Keep all new", el("span", { className: "visually-hidden" }, ` in ${course.name}`)]),
    el("button", { type: "button", className: "button button--small", disabled: busy, onclick: () => decideAssignments(course, pending, "ignored") },
      ["Ignore all new", el("span", { className: "visually-hidden" }, ` in ${course.name}`)]),
  ]);
}

function assignmentInfo(item) {
  return el("span", { className: "assignment-row__info" }, [
    el("span", { className: "assignment-row__name" }, item.name),
    el("span", { className: "assignment-row__meta" }, item.due_at ? `Due ${formatDateTime(item.due_at)}` : "No due date"),
  ]);
}

function pendingRow(course, item) {
  return el("li", { className: "assignment-row is-new" }, [
    el("span", { className: "badge badge--new" }, "New"),
    assignmentInfo(item),
    decisionButtons({
      label: item.name,
      keepText: "Keep",
      onKeep: () => decideAssignments(course, [item], "kept"),
      onIgnore: () => decideAssignments(course, [item], "ignored"),
    }),
  ]);
}

function decidedRow(course, item) {
  const id = `assignment-toggle-${item.id}`;
  return el("li", { className: "assignment-row" }, [
    el("input", {
      id,
      type: "checkbox",
      checked: item.status === "kept",
      disabled: busy,
      dataset: { focusKey: `assignment-${item.id}-toggle` },
      onchange: (event) => decideAssignments(course, [item], event.target.checked ? "kept" : "ignored"),
    }),
    el("label", { htmlFor: id, className: "assignment-row__info" }, [
      el("span", { className: "assignment-row__name" }, item.name),
      el("span", { className: "assignment-row__meta" }, [
        item.status === "kept" ? "Imported as a task" : "Ignored",
        item.due_at && ` · Due ${formatDateTime(item.due_at)}`,
      ]),
    ]),
  ]);
}
