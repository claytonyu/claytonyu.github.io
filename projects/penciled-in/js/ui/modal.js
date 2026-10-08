// One shared <dialog> for every form and confirmation. <dialog>.showModal() traps focus,
// closes on Escape, and restores focus to the opener for us.
import { clear, h } from '../dom.js';

let closeCallback = null;
let pointerDownOnBackdrop = false;

export function setupModal() {
  const dlg = document.getElementById('modal');
  // Close on a backdrop click, but not when a text selection drag merely ends there.
  dlg.addEventListener('pointerdown', (e) => {
    pointerDownOnBackdrop = e.target === dlg;
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && pointerDownOnBackdrop) dlg.close();
  });
  // Fires for Escape. closeModal() also cleans up synchronously, because the 'close' event
  // arrives later and could otherwise land on a dialog opened right after this one closed.
  dlg.addEventListener('close', () => {
    if (!dlg.open) finish(dlg);
  });
}

function finish(dlg) {
  clear(dlg);
  const cb = closeCallback;
  closeCallback = null;
  if (cb) cb();
}

export function openModal({ title, content, wide = false, onClose = null }) {
  const dlg = document.getElementById('modal');
  clear(dlg);
  dlg.classList.toggle('wide', wide);
  dlg.setAttribute('aria-labelledby', 'modal-title');
  dlg.append(
    h(
      'div',
      { class: 'modal-card' },
      h(
        'header',
        { class: 'modal-head' },
        h('h2', { id: 'modal-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeModal, text: '×' }),
      ),
      h('div', { class: 'modal-body' }, content),
    ),
  );
  closeCallback = onClose;
  if (!dlg.open) dlg.showModal();
}

export function closeModal() {
  const dlg = document.getElementById('modal');
  if (!dlg.open) return;
  dlg.close();
  finish(dlg);
}

// Resolves { ok, checked }. Closing the dialog any other way counts as cancel.
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, checkbox = null }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve({ ok, checked: box ? box.checked : false });
      closeModal();
    };
    const box = checkbox ? h('input', { type: 'checkbox', id: 'confirm-extra' }) : null;
    openModal({
      title,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, checked: false });
        }
      },
      content: [
        h('p', { class: 'modal-message', text: message }),
        box ? h('label', { class: 'check', for: 'confirm-extra' }, box, ` ${checkbox.label}`) : null,
        h(
          'div',
          { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => done(false), text: 'Cancel' }),
          h('button', {
            class: danger ? 'btn btn-danger' : 'btn btn-primary',
            type: 'button',
            onclick: () => done(true),
            text: confirmLabel,
          }),
        ),
      ],
    });
  });
}
