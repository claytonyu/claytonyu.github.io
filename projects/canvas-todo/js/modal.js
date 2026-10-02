// Promise-based alert/confirm dialog. <dialog>.showModal() makes the rest of the page inert
// (focus stays inside) and handles Escape for us.
import { el, focusKeyOf, restoreFocus, focusViewHeading } from "./dom.js";

let modalCount = 0;
const openModals = new Set();

export function openModal({ title, message, confirmLabel = "OK", cancelLabel = null, danger = false }) {
  return new Promise((resolve) => {
    modalCount += 1;
    const titleId = `modal-title-${modalCount}`;
    const messageId = `modal-message-${modalCount}`;
    const returnFocus = document.activeElement;
    const dialog = el("dialog", {
      className: "modal",
      role: "alertdialog",
      "aria-labelledby": titleId,
      "aria-describedby": messageId,
    });

    const finish = (result) => {
      openModals.delete(finish);
      dialog.close();
      dialog.remove();
      // If the opener was re-rendered meanwhile, find its replacement (or the view heading).
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else if (focusKeyOf(returnFocus)) restoreFocus(focusKeyOf(returnFocus));
      else focusViewHeading();
      resolve(result);
    };

    const confirmButton = el("button", {
      type: "button",
      className: `button ${danger ? "button--danger" : "button--primary"}`,
      onclick: () => finish(true),
    }, confirmLabel);
    const cancelButton = cancelLabel
      && el("button", { type: "button", className: "button", onclick: () => finish(false) }, cancelLabel);

    dialog.append(
      el("h2", { id: titleId, className: "modal__title" }, title),
      el("p", { id: messageId, className: "modal__message" }, message),
      el("div", { className: "modal__actions" }, [cancelButton, confirmButton]),
    );
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });

    openModals.add(finish);
    document.body.append(dialog);
    dialog.showModal();
    // Default to the safe choice for destructive confirms.
    (cancelButton || confirmButton).focus();
  });
}

export function closeAllModals() {
  [...openModals].forEach((finish) => finish(false));
}
