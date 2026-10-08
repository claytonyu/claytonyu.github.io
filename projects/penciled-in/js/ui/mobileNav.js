// Small screens show one section at a time. This bottom bar switches between them and keeps
// Generate within reach.
import { generate } from '../actions.js';
import { h } from '../dom.js';
import { state, subscribe } from '../store.js';

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

  function update() {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(document.body.dataset.pane === id));
    gen.disabled = state.busy.generating || state.loading;
    gen.textContent = state.busy.generating ? 'Generating…' : 'Generate';
  }

  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-pane'] });
  subscribe(['status', 'auth'], update);
  update();
}
