// Login page, also used as "Reconnect Canvas" when the stored PAT stops working.
// The PAT lives only in the input's value and is cleared as soon as the request resolves.
import { el } from "../dom.js";
import { CANVAS_TOKEN_URL } from "../config.js";
import { login, ApiError } from "../api.js";
import { completeSignIn } from "../auth.js";

const NEW_TOKEN = "Create a new token";
const NEW_OR_OLD_TOKEN = "Paste your existing token if you saved it, or create a new one";

const MODES = {
  first: {
    title: "Sign in with Canvas",
    lead: "This app imports your Canvas assignments as tasks. To get started, create a new Canvas access token and paste it below.",
    tokenHint: NEW_TOKEN,
  },
  expired: {
    title: "Your session has ended",
    lead: "Sessions last 7 days, or until you close this tab. Your tasks are saved.",
    tokenHint: NEW_OR_OLD_TOKEN,
  },
  logged_out: {
    title: "You're logged out",
    lead: "Your tasks and Canvas connection are saved for when you come back.",
    tokenHint: NEW_OR_OLD_TOKEN,
  },
  disconnected: {
    title: "Canvas disconnected",
    lead: "Your token was removed from this app and all sessions were ended. This app can't revoke the token in Canvas, so delete it under Canvas → Account → Settings → Approved Integrations.",
    tokenHint: NEW_TOKEN,
  },
  deleted: {
    title: "Account deleted",
    lead: "Your account and all of its data were deleted. Remember to also delete the token in Canvas under Account → Settings → Approved Integrations.",
    tokenHint: NEW_TOKEN,
  },
  reconnect: {
    title: "Reconnect Canvas",
    lead: "Canvas no longer accepts the saved token (it may have expired or been deleted). You're still signed in; paste a new token to keep syncing.",
    tokenHint: NEW_TOKEN,
  },
};

function modeFor(name, params) {
  if (name === "reconnect") return MODES.reconnect;
  return MODES[params.get("reason")] ?? MODES.first;
}

export function mount(root, { name, params }) {
  const mode = modeFor(name, params);
  const isReconnect = mode === MODES.reconnect;

  const input = el("input", {
    id: "canvas-token",
    className: "input",
    type: "password",
    autocomplete: "off",
    required: true,
    "aria-describedby": "canvas-token-error",
  });
  const error = el("p", { id: "canvas-token-error", className: "field__error", role: "alert" });
  const status = el("p", { className: "login__status", role: "status" });
  const submit = el("button", { type: "submit", className: "button button--primary" }, isReconnect ? "Reconnect" : "Sign in");

  const form = el("form", {
    className: "login__form",
    noValidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      signIn({ input, error, status, submit });
    },
  }, [
    el("label", { className: "field__label", htmlFor: "canvas-token" }, "Canvas access token"),
    input,
    error,
    el("p", { className: "field__hint" }, "Your token is sent once to the server, where it's stored encrypted. It's never saved in this browser."),
    el("div", { className: "login__actions" }, [
      submit,
      isReconnect && el("a", { href: "#/tasks", className: "button" }, "Cancel"),
    ]),
    status,
  ]);

  root.append(el("section", { className: "login" }, [
    el("div", { className: "login__card" }, [
      el("p", { className: "login__brand" }, "Canvas To-Do"),
      el("h1", { className: "login__title", tabIndex: -1 }, mode.title),
      el("p", { className: "login__lead" }, mode.lead),
      el("h2", { className: "login__subtitle" }, `${mode.tokenHint}:`),
      tokenSteps(),
      form,
    ]),
  ]));
}

export function update() {}

function tokenSteps() {
  return el("ol", { className: "login__steps" }, [
    el("li", {}, [
      "Open your ",
      el("a", { href: CANVAS_TOKEN_URL, target: "_blank", rel: "noreferrer", className: "link" }, [
        "Canvas settings",
        el("span", { className: "visually-hidden" }, " (opens in a new tab)"),
      ]),
      ".",
    ]),
    el("li", {}, "Under “Approved Integrations”, choose “+ New Access Token”."),
    el("li", {}, "Enter a purpose like “To-do app”, optionally set an expiry date, and generate the token."),
    el("li", {}, "Copy the token right away (Canvas only shows it once) and paste it below."),
  ]);
}

async function signIn({ input, error, status, submit }) {
  const token = input.value.trim();
  error.textContent = "";
  if (!token) {
    error.textContent = "Paste your Canvas access token.";
    input.focus();
    return;
  }

  submit.disabled = true;
  status.textContent = "Signing in… if the server was asleep this can take up to a minute.";
  try {
    const session = await login(token);
    input.value = "";
    completeSignIn(session);
  } catch (caught) {
    if (!(caught instanceof ApiError)) throw caught;
    error.textContent = caught.status === 401
      ? "Canvas didn't accept that token. Check that you copied all of it, or create a new one."
      : caught.message;
    input.focus();
  } finally {
    submit.disabled = false;
    status.textContent = "";
  }
}
