// Small screens show one section at a time. This bottom bar switches between them and keeps
// Generate within reach.
import { generate } from '../actions.js';
import { h } from '../dom.js';
import { state, subscribe } from '../store.js';
import { plural } from '../util.js';
import { showToast } from './toast.js';

const PANES = [
  { id: 'inputs', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'plan', label: 'Plan' },
];

export function mountMobileNav(root) {
  const buttons = new Map();
  const select = (id) => {
    document.body.dataset.pane = id;
    update();
  };
  for (const p of PANES) {
    const b = h('button', { class: 'mobile-tab', type: 'button', text: p.label, onclick: () => select(p.id) });
    buttons.set(p.id, b);
    root.append(b);
  }
  const gen = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    onclick: () => {
      select('calendar');
      generate();
    },
  });
  root.append(gen);

  // Notices and results live in the Plan pane, which is hidden here unless selected.
  // Without this, a failed Generate (or a "session ended" message) would be invisible.
  const announced = new Set();
  let announcedResult = null;
  const isMobile = () => getComputedStyle(root).display !== 'none';

  function announceHiddenFeedback() {
    const current = new Set(state.notices.map((n) => `${n.id}|${n.text}`));
    for (const key of announced) if (!current.has(key)) announced.delete(key); // allow it to show again later
    const viewingPlan = document.body.dataset.pane === 'plan';
    for (const n of state.notices) {
      const key = `${n.id}|${n.text}`;
      if (announced.has(key)) continue;
      announced.add(key);
      if (isMobile() && !viewingPlan && n.kind !== 'info') showToast(n.text, 8000);
    }
    const r = state.result;
    if (r && r !== announcedResult) {
      announcedResult = r;
      const short = r.unschedulable.filter((u) => state.tasks.some((t) => t.id === u.task_id)).length;
      if (isMobile() && !viewingPlan && short) {
        showToast(`${plural(short, 'task')} can't fully fit. Open the Plan tab for details.`, 8000);
      }
    }
  }

  function update() {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(document.body.dataset.pane === id));
    // Count what is waiting in the Plan pane, like the counts on the left-hand tabs.
    const waiting = state.notices.length;
    buttons.get('plan').textContent = waiting ? `Plan (${waiting})` : 'Plan';
    gen.disabled = state.busy.generating || state.loading;
    gen.textContent = state.busy.generating ? 'Generating…' : 'Generate';
  }

  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-pane'] });
  subscribe(['status', 'auth'], () => {
    update();
    announceHiddenFeedback();
  });
  update();
  announceHiddenFeedback();
}
