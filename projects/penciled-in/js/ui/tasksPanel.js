import { clear, h, keepFocus } from '../dom.js';
import { deleteTask, setFocusDay, state, subscribe } from '../store.js';
import { dayOfWall, fmtDuration, fmtInstant, utcToWall } from '../time.js';
import { taskHue } from '../util.js';
import { confirmDialog } from './modal.js';
import { openTaskForm } from './taskForm.js';

export function showCalendarPane() {
  document.body.dataset.pane = 'calendar';
}

function jumpToTask(task) {
  const tz = state.settings.timezone;
  const first = state.chunks
    .filter((c) => c.task_id === task.id)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const ms = first ? Date.parse(first.start) : Date.parse(task.due_at);
  setFocusDay(dayOfWall(utcToWall(ms, tz)));
  showCalendarPane();
}

export function mountTasks(root) {
  const list = h('ul', { class: 'items' });
  const empty = h('p', { class: 'empty', text: 'No tasks yet. Add what you need to get done, with a due date and how long it will take.' });
  const addBtn = h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: '+ Add task', onclick: () => openTaskForm() });
  root.append(
    h('div', { class: 'panel-head' }, h('p', { class: 'panel-sub', text: 'What needs doing' }), addBtn),
    empty,
    list,
  );

  const build = () => {
    const tz = state.settings.timezone;
    const now = Date.now();
    clear(list);
    empty.hidden = state.tasks.length > 0 || state.loading;
    if (state.loading) {
      list.append(h('li', { class: 'empty', text: 'Loading your tasks…' }));
      return;
    }
    const sorted = [...state.tasks].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
    for (const t of sorted) {
      const plannedMin = state.chunks
        .filter((c) => c.task_id === t.id)
        .reduce((sum, c) => sum + (Date.parse(c.end) - Date.parse(c.start)) / 60000, 0);
      const pct = Math.min(100, Math.round((plannedMin / t.duration_min) * 100));
      // After an edit the last result no longer describes the inputs, so don't show it on the task.
      const short = !state.inputsChanged && state.result && state.result.unschedulable.find((u) => u.task_id === t.id);
      const due = Date.parse(t.due_at);
      list.append(
        h(
          'li',
          { class: 'item', style: { '--h': taskHue(t.id) } },
          h('span', { class: 'swatch task-swatch', 'aria-hidden': 'true' }),
          h(
            'div',
            { class: 'item-main' },
            h('button', {
              class: 'item-title',
              type: 'button',
              title: 'Show on calendar',
              text: t.title,
              dataset: { focusKey: `task-title-${t.id}` },
              onclick: () => jumpToTask(t),
            }),
            h('div', { class: 'item-meta', text: `Due ${fmtInstant(due, tz)}` }),
            h('div', {
              class: 'item-meta',
              text: `${fmtDuration(t.duration_min)}${t.splittable ? ` · can split${t.min_chunk_min ? `, pieces of ${fmtDuration(t.min_chunk_min)}+` : ''}` : ' · in one piece'}`,
            }),
            h(
              'div',
              { class: 'progress', role: 'img', 'aria-label': `${fmtDuration(plannedMin)} of ${fmtDuration(t.duration_min)} planned` },
              h('span', { style: { width: `${pct}%` } }),
            ),
            h('div', { class: 'item-meta', text: `${fmtDuration(plannedMin)} of ${fmtDuration(t.duration_min)} planned` }),
            short ? h('span', { class: 'chip chip-bad', text: `Short by ${fmtDuration(short.missing_min)}` }) : null,
            due <= now ? h('span', { class: 'chip chip-warn', text: 'Past due' }) : null,
          ),
          h(
            'div',
            { class: 'item-actions' },
            h('button', {
              class: 'btn btn-sm',
              type: 'button',
              text: 'Edit',
              'aria-label': `Edit ${t.title}`,
              dataset: { focusKey: `task-edit-${t.id}` },
              onclick: () => openTaskForm(t),
            }),
            h('button', {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              text: 'Delete',
              'aria-label': `Delete ${t.title}`,
              dataset: { focusKey: `task-delete-${t.id}` },
              onclick: async () => {
                const { ok } = await confirmDialog({
                  title: 'Delete this task?',
                  message: `"${t.title}" and its scheduled chunks will be removed.`,
                  confirmLabel: 'Delete task',
                  danger: true,
                });
                if (ok) deleteTask(t.id);
              },
            }),
          ),
        ),
      );
    }
  };

  const render = () => keepFocus(list, build, addBtn);
  subscribe(['data', 'auth', 'status'], render);
  render();
}
