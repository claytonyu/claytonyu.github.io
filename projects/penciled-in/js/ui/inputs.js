// Left sidebar: Tasks / Blocks / Calendars tabs.
import { h } from '../dom.js';
import { state, subscribe } from '../store.js';
import { mountBlocks } from './blocksPanel.js';
import { mountCalendars } from './calendarsPanel.js';
import { mountTasks } from './tasksPanel.js';

const TABS = [
  { id: 'tasks', label: 'Tasks', mount: mountTasks, count: () => state.tasks.length },
  { id: 'blocks', label: 'Blocks', mount: mountBlocks, count: () => state.blocks.length },
  { id: 'calendars', label: 'Calendars', mount: mountCalendars, userOnly: true, count: () => state.calendars.filter((c) => c.selected).length },
];

export function mountInputs(root) {
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Inputs' });
  const buttons = new Map();
  const panels = new Map();

  for (const tab of TABS) {
    const btn = h('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      id: `tab-${tab.id}`,
      'aria-controls': `tabpanel-${tab.id}`,
      onclick: () => select(tab.id),
      onkeydown: (e) => onKey(e, tab.id),
    });
    buttons.set(tab.id, btn);
    tablist.append(btn);
    const panel = h('div', { class: 'tabpanel', role: 'tabpanel', id: `tabpanel-${tab.id}`, 'aria-labelledby': `tab-${tab.id}`, tabindex: '0' });
    tab.mount(panel);
    panels.set(tab.id, panel);
  }
  root.append(tablist, ...panels.values());

  const visibleTabs = () => TABS.filter((t) => !t.userOnly || state.mode === 'user');

  function select(id, { focus = false } = {}) {
    state.ui.tab = id;
    update();
    if (focus) buttons.get(id).focus();
  }

  function onKey(e, id) {
    const tabs = visibleTabs();
    const i = tabs.findIndex((t) => t.id === id);
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) {
      e.preventDefault();
      select(next.id, { focus: true });
    }
  }

  function update() {
    const tabs = visibleTabs();
    if (!tabs.some((t) => t.id === state.ui.tab)) state.ui.tab = 'tasks';
    for (const tab of TABS) {
      const shown = tabs.includes(tab);
      const btn = buttons.get(tab.id);
      const active = shown && tab.id === state.ui.tab;
      btn.hidden = !shown;
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
      const n = tab.count();
      btn.textContent = n > 0 ? `${tab.label} (${n})` : tab.label;
      panels.get(tab.id).hidden = !active;
    }
  }

  subscribe(['data', 'auth'], update);
  update();
}
