// App entry: routing between views, global auth handling and data loading.
import { currentRoute, navigate } from "./router.js";
import { hasSession, getToken, clearSession } from "./session.js";
import { state, subscribe } from "./state.js";
import { getHealth, setAuthHandlers } from "./api.js";
import { loadMissingData } from "./actions.js";
import { syncIfNeeded, pendingCount } from "./canvas.js";
import { handleError } from "./errors.js";
import { expireSession } from "./auth.js";
import { startExpiryWatch } from "./expiry.js";
import { showBanner } from "./notify.js";
import { closeTaskSidebar } from "./views/taskSidebar.js";
import * as loginView from "./views/login.js";
import * as taskListView from "./views/taskList.js";
import * as canvasImportView from "./views/canvasImport.js";
import * as settingsView from "./views/settings.js";

// Each view exports mount(root, route) and update(); update() runs after every state change.
// "shell" views show the nav, and sync with Canvas when opened if a sync is needed.
const VIEWS = {
  login: { view: loginView, title: "Sign in", shell: false },
  reconnect: { view: loginView, title: "Reconnect Canvas", shell: false },
  tasks: { view: taskListView, title: "Tasks", shell: true },
  import: { view: canvasImportView, title: "Canvas Import", shell: true },
  settings: { view: settingsView, title: "Settings", shell: true },
};

const viewRoot = document.getElementById("view");
const shellNav = document.getElementById("app-nav");
const userName = document.getElementById("nav-user");
const pendingBadge = document.getElementById("nav-pending");
let activeView = null;

function onRouteChange() {
  const route = currentRoute();
  const signedIn = hasSession();

  if (!signedIn && route.name !== "login") return redirectToLogin();
  if (signedIn && route.name === "login") return navigate("tasks");
  if (!VIEWS[route.name]) return navigate("tasks");

  showView(route);
  if (!signedIn) return;
  loadMissingData().catch((error) => handleError(error));
  if (VIEWS[route.name].shell) syncIfNeeded();
}

// A token that's still in sessionStorage but past expires_at means the session ran out.
function redirectToLogin() {
  const expired = getToken() !== null;
  clearSession();
  navigate("login", expired ? { reason: "expired" } : {});
}

function showView(route) {
  const { view, title, shell } = VIEWS[route.name];
  // The sidebar is non-modal, so the nav stays clickable while editing. Keep it open across app
  // pages rather than silently dropping unsaved edits; only leaving the app shell closes it.
  if (!shell) closeTaskSidebar();
  activeView = view;
  document.title = `${title} · Canvas To-Do`;
  shellNav.hidden = !shell;
  shellNav.querySelectorAll("a[data-route]").forEach((link) => {
    if (link.dataset.route === route.name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  viewRoot.replaceChildren();
  view.mount(viewRoot, route);
  renderShell();
  viewRoot.querySelector("h1")?.focus();
}

function renderShell() {
  userName.textContent = state.user?.name ?? "";
  const pending = pendingCount();
  pendingBadge.hidden = pending === 0;
  pendingBadge.textContent = `${pending} new`;
}

// 403 canvas_token_required: the session is fine, only the stored PAT is bad. Don't log out.
function onCanvasTokenRequired() {
  showBanner("canvas-token", "Canvas no longer accepts your saved access token. You're still signed in.", {
    kind: "warning",
    action: { label: "Reconnect Canvas", onClick: () => navigate("reconnect") },
  });
}

setAuthHandlers({ onUnauthorized: expireSession, onCanvasTokenRequired });
subscribe(() => {
  renderShell();
  activeView?.update();
});
window.addEventListener("hashchange", onRouteChange);
document.getElementById("skip-link").addEventListener("click", () => viewRoot.focus());

// Wake the (possibly sleeping) Render service early. Failures surface on the real requests.
getHealth().catch(() => {});
onRouteChange();
startExpiryWatch();
