// After the first login, offer to move guest data (kept in this browser) into the account.
import { importGuest } from '../actions.js';
import { describeError } from '../api.js';
import { h } from '../dom.js';
import { clearGuest, guestHasData, readGuest } from '../store.js';
import { plural } from '../util.js';
import { closeModal, confirmDialog, openModal } from './modal.js';

export function offerImport() {
  const g = readGuest();
  if (!guestHasData(g)) return;

  const settings = h('input', { type: 'checkbox', id: 'import-settings' });
  const keep = h('input', { type: 'checkbox', id: 'import-keep' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const importBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'Import into my account' });

  importBtn.addEventListener('click', async () => {
    error.textContent = '';
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';
    try {
      await importGuest({ withSettings: settings.checked });
      if (!keep.checked) clearGuest();
      closeModal();
    } catch (err) {
      error.textContent = `Couldn't import. ${describeError(err)}`;
      importBtn.disabled = false;
      importBtn.textContent = 'Import into my account';
    }
  });

  const discard = async () => {
    const { ok } = await confirmDialog({
      title: 'Discard local data?',
      message: 'This removes the guest tasks, blocks and schedule saved in this browser. Your account is not affected.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (ok) clearGuest();
    else offerImport();
  };

  openModal({
    title: 'Import your guest data?',
    content: [
      h('p', {
        class: 'modal-message',
        text: `This browser has ${plural((g.tasks || []).length, 'task')}, ${plural((g.blocks || []).length, 'block')} and ${plural(
          (g.chunks || []).length,
          'scheduled chunk',
        )} saved from before you logged in. Importing adds them to your account. Anything with the same ID is replaced by this browser's copy.`,
      }),
      h('label', { class: 'check', for: 'import-settings' }, settings, ' Also use my guest settings (padding, working hours, time zone)'),
      h('label', { class: 'check', for: 'import-keep' }, keep, ' Keep a copy in this browser'),
      error,
      h(
        'div',
        { class: 'modal-actions stack' },
        importBtn,
        h('button', { class: 'btn', type: 'button', text: 'Not now', onclick: closeModal }),
        h('button', { class: 'btn btn-ghost btn-danger-text', type: 'button', text: 'Discard local data', onclick: () => { closeModal(); discard(); } }),
      ),
    ],
  });
}
