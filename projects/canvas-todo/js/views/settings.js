// Settings: account info from Canvas, plus log out / disconnect Canvas / delete account.
import { el } from "../dom.js";
import { state } from "../state.js";
import { getExpiresAt } from "../session.js";
import { logout, disconnectCanvas, deleteAccount } from "../api.js";
import { endSession } from "../auth.js";
import { handleError } from "../errors.js";
import { openModal } from "../modal.js";
import { formatDateTime } from "../format.js";

const REVOKE_NOTE = "This app can't revoke the token in Canvas, so also delete it under Canvas → Account → Settings → Approved Integrations.";

const ACTIONS = [
  {
    id: "logout",
    label: "Log out",
    description: "Ends your session in this tab. Your tasks and Canvas connection stay saved. To sign back in you'll paste a Canvas access token again (the same one, or a new one).",
    request: logout,
    reason: "logged_out",
  },
  {
    id: "disconnect",
    label: "Disconnect Canvas",
    description: `Removes your Canvas token from this app and signs you out everywhere. Your tasks, courses and import choices are kept for if you reconnect. ${REVOKE_NOTE}`,
    request: disconnectCanvas,
    reason: "disconnected",
    confirm: {
      title: "Disconnect Canvas?",
      message: `You'll be signed out on every device. Your tasks are kept. ${REVOKE_NOTE}`,
      confirmLabel: "Disconnect",
    },
  },
  {
    id: "delete",
    label: "Delete account",
    description: "Permanently deletes your account and everything in it: tasks, courses, import choices and your stored Canvas token. This can't be undone.",
    request: deleteAccount,
    reason: "deleted",
    danger: true,
    confirm: {
      title: "Delete your account?",
      message: "All of your tasks and settings will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete account",
    },
  },
];

export function mount(root) {
  root.append(
    el("header", { className: "view-header" }, [el("h1", { className: "view-title", tabIndex: -1 }, "Settings")]),
    el("section", { className: "panel", "aria-labelledby": "settings-account" }, [
      el("h2", { id: "settings-account", className: "section-title" }, "Account"),
      el("dl", { id: "settings-info", className: "info-list" }),
    ]),
    el("section", { className: "panel", "aria-labelledby": "settings-actions" }, [
      el("h2", { id: "settings-actions", className: "section-title" }, "Session and data"),
      el("p", { className: "hint" }, [
        "To restore ignored courses or assignments, use ",
        el("a", { href: "#/import", className: "link" }, "Canvas Import"),
        ".",
      ]),
      ACTIONS.map(actionRow),
    ]),
  );
  update();
}

export function update() {
  const user = state.user;
  const expiresAt = getExpiresAt();
  const rows = [
    ["Name", user?.name ?? "Loading…"],
    ["Canvas user ID", user ? String(user.canvas_user_id) : "Loading…"],
    ["Canvas", canvasStatus(user)],
    ["Session ends", expiresAt ? formatDateTime(expiresAt.toISOString()) : ""],
  ];
  document.getElementById("settings-info").replaceChildren(...rows.flatMap(([term, value]) => [el("dt", {}, term), el("dd", {}, value)]));
}

function canvasStatus(user) {
  if (!user) return "Loading…";
  if (user.canvas_connected) return "Connected";
  return ["Needs a new token. ", el("a", { href: "#/reconnect", className: "link" }, "Reconnect Canvas")];
}

function actionRow(action) {
  const descriptionId = `action-${action.id}-description`;
  const button = el("button", {
    type: "button",
    className: `button ${action.danger ? "button--danger" : ""}`,
    "aria-describedby": descriptionId,
    onclick: () => runAction(action, button),
  }, action.label);
  return el("div", { className: "action-row" }, [
    el("p", { id: descriptionId, className: "action-row__description" }, action.description),
    button,
  ]);
}

async function runAction(action, button) {
  if (action.confirm) {
    const confirmed = await openModal({ ...action.confirm, cancelLabel: "Cancel", danger: true });
    if (!confirmed) return;
  }
  button.disabled = true;
  try {
    await action.request();
    endSession(action.reason);
  } catch (error) {
    // Logging out should never leave the user signed in locally, even if the server call failed.
    if (action.id === "logout") endSession(action.reason);
    else handleError(error);
  } finally {
    button.disabled = false;
  }
}
