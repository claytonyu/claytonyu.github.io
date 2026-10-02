// Pure filter/sort/group logic for the Task List. No DOM or state access.
import { matchesQuery } from "./search.js";

export const NO_COURSE_NAME = "No course";

export function courseNameFor(courses, courseId) {
  if (courseId === null) return NO_COURSE_NAME;
  return courses.find((course) => course.id === courseId)?.name ?? "Unknown course";
}

// A task matches the search if its title or its course name matches.
export function filterTasks(tasks, { search, showCompleted }, nameOf) {
  return tasks.filter((task) => (showCompleted || !task.completed)
    && (matchesQuery(task.title, search) || matchesQuery(nameOf(task.course_id), search)));
}

function dueValue(task) {
  return task.due_at ? Date.parse(task.due_at) : Infinity;
}

// "|| a.id - b.id" also covers Infinity - Infinity (NaN) when both have no due date.
const byDue = (a, b) => dueValue(a) - dueValue(b) || a.id - b.id;

const TASK_SORTS = {
  due: byDue,
  title: (a, b) => a.title.localeCompare(b.title) || byDue(a, b),
  newest: (a, b) => b.id - a.id,
};

export function sortTasks(tasks, sort) {
  return [...tasks].sort(TASK_SORTS[sort]);
}

function soonestDue(group) {
  return Math.min(Infinity, ...group.tasks.map(dueValue));
}

const byName = (a, b) => a.name.localeCompare(b.name);

const COURSE_SORTS = {
  name: byName,
  soonest: (a, b) => soonestDue(a) - soonestDue(b) || byName(a, b),
};

// Groups: the "No course" dummy group, every kept course, plus any other course a task points at.
// The dummy group sorts like any other course.
export function groupTasks(tasks, courses, courseSort, nameOf) {
  const groups = new Map([[null, { id: null, name: NO_COURSE_NAME, tasks: [] }]]);
  courses
    .filter((course) => course.status === "kept")
    .forEach((course) => groups.set(course.id, { id: course.id, name: course.name, tasks: [] }));
  tasks.forEach((task) => {
    if (!groups.has(task.course_id)) {
      groups.set(task.course_id, { id: task.course_id, name: nameOf(task.course_id), tasks: [] });
    }
    groups.get(task.course_id).tasks.push(task);
  });
  return [...groups.values()].sort(COURSE_SORTS[courseSort]);
}
