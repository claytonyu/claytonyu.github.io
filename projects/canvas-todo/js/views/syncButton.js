// "Sync with Canvas" button shared by the Task List and Canvas Import headers.
import { el } from "../dom.js";
import { state } from "../state.js";
import { runSync } from "../canvas.js";

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function createSyncControl() {
  return el("div", { className: "sync-control" }, [
    el("button", {
      type: "button",
      className: "button",
      dataset: { focusKey: "sync" },
      onclick: runSync,
    }),
    el("span", { className: "sync-control__status" }),
  ]);
}

// Called from each view's update().
export function refreshSyncControl(control) {
  const [button, status] = control.children;
  // aria-disabled rather than disabled keeps keyboard focus on the button; runSync() ignores repeat clicks.
  button.setAttribute("aria-disabled", String(state.syncing));
  button.textContent = state.syncing ? "Syncing…" : "Sync with Canvas";
  status.textContent = state.lastSyncedAt ? `Last synced ${TIME.format(state.lastSyncedAt)}` : "";
}
