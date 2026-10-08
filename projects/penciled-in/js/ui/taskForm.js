import { field, h } from '../dom.js';
import { addTask, state, updateTask } from '../store.js';
import { DAY_MIN, dayOfWall, fromInputDateTime, toInputDateTime, utcToWall, wallToUtc } from '../time.js';
import { uuid } from '../util.js';
import { closeModal, openModal } from './modal.js';

// Tomorrow at 5 PM in the user's time zone.
function defaultDue(tz) {
  const day = dayOfWall(utcToWall(Date.now(), tz)) + 1;
  return wallToUtc(day * DAY_MIN + 17 * 60, tz);
}

export function openTaskForm(task = null) {
  const tz = state.settings.timezone;
  const totalMin = task ? task.duration_min : 60;

  const title = h('input', { type: 'text', maxlength: 200, required: true, autocomplete: 'off', value: task ? task.title : '' });
  const due = h('input', { type: 'datetime-local', required: true, value: toInputDateTime(task ? Date.parse(task.due_at) : defaultDue(tz), tz) });
  const hours = h('input', { type: 'number', min: 0, max: 168, step: 1, inputMode: 'numeric', value: String(Math.floor(totalMin / 60)) });
  const mins = h('input', { type: 'number', min: 0, max: 59, step: 5, inputMode: 'numeric', value: String(totalMin % 60) });
  const split = h('input', { type: 'checkbox', id: 'task-split', checked: !!(task && task.splittable) });
  const minChunk = h('input', {
    type: 'number',
    min: 1,
    max: 10080,
    step: 5,
    inputMode: 'numeric',
    placeholder: '15',
    value: task && task.min_chunk_min ? String(task.min_chunk_min) : '',
  });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const syncSplit = () => {
    minChunk.disabled = !split.checked;
  };
  split.addEventListener('change', syncSplit);
  syncSplit();

  const submit = (e) => {
    e.preventDefault();
    error.textContent = '';
    const name = title.value.trim();
    if (!name || name.length > 200) return fail('Give the task a name (up to 200 characters).');
    const dueMs = fromInputDateTime(due.value, tz);
    if (Number.isNaN(dueMs)) return fail('Choose a due date and time.');
    const duration = (parseInt(hours.value || '0', 10) || 0) * 60 + (parseInt(mins.value || '0', 10) || 0);
    if (duration < 1 || duration > 10080) return fail('Estimated time must be between 1 minute and 7 days.');

    const next = {
      id: task ? task.id : uuid(),
      title: name,
      due_at: new Date(dueMs).toISOString(),
      duration_min: duration,
      splittable: split.checked,
    };
    if (split.checked && minChunk.value !== '') {
      const mc = parseInt(minChunk.value, 10);
      if (!Number.isInteger(mc) || mc < 1 || mc > 10080) return fail('Smallest piece must be a whole number of minutes (at least 1).');
      next.min_chunk_min = Math.min(mc, duration);
    }
    if (task) updateTask(next);
    else addTask(next);
    closeModal();
  };
  const fail = (msg) => {
    error.textContent = msg;
  };

  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: submit },
    field('task-title', 'Task', title),
    field('task-due', 'Due', due, `Times are in ${tz}. You can change the time zone in the planning settings.`),
    h(
      'fieldset',
      { class: 'field' },
      h('legend', { text: 'Estimated time' }),
      h(
        'div',
        { class: 'inline-fields' },
        h('label', { class: 'unit' }, hours, ' hours'),
        h('label', { class: 'unit' }, mins, ' minutes'),
      ),
    ),
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'task-split' }, split, ' Allow splitting into pieces')),
    field('task-minchunk', 'Smallest piece (minutes)', minChunk, 'Optional. Defaults to 15 minutes when splitting is allowed.'),
    error,
    h(
      'div',
      { class: 'modal-actions' },
      h('button', { class: 'btn', type: 'button', onclick: closeModal, text: 'Cancel' }),
      h('button', { class: 'btn btn-primary', type: 'submit', text: task ? 'Save task' : 'Add task' }),
    ),
  );
  openModal({ title: task ? 'Edit task' : 'New task', content: form });
  title.focus();
}
