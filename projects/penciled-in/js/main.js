import { enterUserMode, handleUnauthorized, loadState } from './actions.js';
import * as api from './api.js';
import { consumeHash, getToken, loginErrorMessage, setToken } from './auth.js';
import * as sync from './sync.js';
import { emit, enterGuestState, notify, state } from './store.js';
import { mountCalendar } from './ui/calendarView.js';
import { mountInputs } from './ui/inputs.js';
import { mountMobileNav } from './ui/mobileNav.js';
import { setupModal } from './ui/modal.js';
import { mountPlan } from './ui/planPanel.js';
import { mountTopbar } from './ui/topbar.js';

function wire() {
  api.setHandlers({
    onUnauthorized: handleUnauthorized,
    onSlow: (slow) => {
      state.busy.waking = slow;
      emit('status');
    },
  });

  sync.configure({
    onStatus: (s) => {
      state.syncStatus = s;
      emit('status');
    },
    onSkipped: (skipped) => {
      // A calendar was removed in Google, or another device already ignored the same event.
      // Re-read the server's view so local IDs and lists match.
      const gone = skipped.some((s) => s.reason === 'unknown_calendar');
      notify(
        'sync-skipped',
        'info',
        gone
          ? 'A Google calendar you changed no longer exists, so that change was skipped. Your list was refreshed.'
          : 'Another device already ignored that event, so your list was refreshed.',
      );
      loadState({ syncGoogle: false });
    },
    onRejected: (err, info) => {
      notify(
        'sync-rejected',
        'error',
        info.discarded
          ? `Some changes couldn't be saved (${err.detail}). Your data was reloaded from the server.`
          : `${info.dropped === 1 ? 'One change' : 'Some changes'} couldn't be saved (${err.detail}) and ${info.dropped === 1 ? 'was' : 'were'} skipped.`,
      );
      if (info.discarded) loadState({ syncGoogle: false });
    },
  });

  // Save pending edits when the tab goes away. keepalive lets the request outlive the page.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.mode === 'user') sync.flush({ keepalive: true });
  });
  window.addEventListener('pagehide', () => {
    if (state.mode === 'user') sync.flush({ keepalive: true });
  });
}

async function init() {
  setupModal();
  wire();

  mountTopbar(document.getElementById('auth-area'));
  mountInputs(document.getElementById('pane-inputs'));
  mountCalendar(document.getElementById('pane-calendar'));
  mountPlan(document.getElementById('pane-plan'));
  mountMobileNav(document.getElementById('mobile-nav'));

  api.ping(); // wake the server in the background

  const { token, loginError } = consumeHash();
  if (token) setToken(token);
  if (loginError) notify('login-error', 'error', loginErrorMessage(loginError));

  if (getToken()) await enterUserMode({ afterLogin: !!token });
  else enterGuestState();
}

init();
