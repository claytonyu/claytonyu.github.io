// Top-right area: the account menu, and the Refresh Google button sitting directly above
// the Generate button. The title is static markup in index.html.
import { deleteAccount, login, logout, refreshGoogle } from '../actions.js';
import { describeError } from '../api.js';
import { clear, h } from '../dom.js';
import { notify, state, subscribe } from '../store.js';
import { confirmDialog } from './modal.js';

export function mountTopbar(root, refreshRoot) {
  const refreshBtn = h('button', { class: 'btn', type: 'button', onclick: refreshGoogle });
  refreshRoot.append(refreshBtn);

  // Only meaningful when logged in and the server has Google set up for this account.
  const renderRefresh = () => {
    const show = state.mode === 'user' && state.googleError !== 'not_connected' && state.googleError !== 'not_configured';
    refreshRoot.hidden = !show;
    refreshBtn.disabled = state.busy.refreshing || state.loading;
    refreshBtn.textContent = state.busy.refreshing ? 'Refreshing…' : 'Refresh Google';
    const loaded = state.events.filter((ev) => {
      const cal = state.calendars.find((c) => c.id === ev.calendar_id);
      return !cal || cal.selected;
    }).length;
    refreshBtn.title = `Reload your Google calendars and events (${loaded} loaded)`;
  };

  const render = () => {
    clear(root);
    if (state.mode === 'guest') {
      root.append(
        h('span', { class: 'who', text: 'Guest · saved in this browser' }),
        h('button', { class: 'btn', type: 'button', text: 'Log in with Google', onclick: login }),
      );
      return;
    }
    const label = state.user && state.user.email ? state.user.email : 'Signing in…';
    const menu = h('details', { class: 'menu' });
    const close = () => {
      menu.open = false;
    };
    menu.append(
      h('summary', { class: 'btn menu-btn' }, h('span', { class: 'menu-label', text: label })),
      h(
        'div',
        { class: 'menu-pop' },
        h('button', {
          class: 'menu-item',
          type: 'button',
          text: 'Log out',
          onclick: () => {
            close();
            logout();
          },
        }),
        h('button', {
          class: 'menu-item danger',
          type: 'button',
          text: 'Delete my data…',
          onclick: async () => {
            close();
            const { ok, checked } = await confirmDialog({
              title: 'Delete all your data?',
              message:
                'This permanently deletes your account, tasks, blocks, schedule and Google connection from Penciled In. It does not touch your Google Calendar. This cannot be undone.',
              confirmLabel: 'Delete everything',
              danger: true,
              checkbox: { label: 'Also clear the guest data stored in this browser' },
            });
            if (!ok) return;
            try {
              await deleteAccount({ clearLocal: checked });
              notify('account-deleted', 'info', 'Your account and data were deleted.');
            } catch (err) {
              notify('account-error', 'error', `Couldn't delete your data. ${describeError(err)}`);
            }
          },
        }),
      ),
    );
    root.append(menu);
  };

  // Close the menu when clicking elsewhere or pressing Escape.
  document.addEventListener('click', (e) => {
    const open = root.querySelector('details[open]');
    if (open && !open.contains(e.target)) open.open = false;
  });
  document.addEventListener('keydown', (e) => {
    const open = root.querySelector('details[open]');
    if (e.key === 'Escape' && open) {
      open.open = false;
      open.querySelector('summary').focus();
    }
  });

  subscribe(['auth'], render);
  subscribe(['auth', 'status', 'data'], renderRefresh);
  render();
  renderRefresh();
}
