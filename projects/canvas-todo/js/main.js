// App entry: routing between views, global auth handling and data loading.
import { currentRoute, navigate } from "./router.js";
import { hasSession, getToken, clearSession } from "./session.js";
import { state, subscribe } from "./state.js";
import { getHealth, setAuthHandlers } from "./api.js";
import { loadMissingData } from "./actions.js";
import { handleError } from "./errors.js";
import { endSession } from "./auth.js";
import { openModal } from "./modal.js";
import { showBanner } from "./notify.js";
import { closeTaskSidebar, isTaskSidebarDirty } from "./views/taskSidebar.js";
import * as loginView from "./views/login.js";
import * as taskListView from "./views/taskList.js";

// Each view exports mount(root, route) and update(); update() runs after every state change.
const VIEWS = {
  login: { view: loginView, title: "Sign in", shell: false },
  reconnect: { view: loginView, title: "Reconnect Canvas", shell: false },
  tasks: { view: taskListView, title: "Tasks", shell: true },
};

const viewRoot = document.getElementById("view");
const shellNav = document.getElementById("app-nav");
const userName = document.getElementById("nav-user");
let activeView = null;

function onRouteChange() {
  const route = currentRoute();
  const signedIn = hasSession();

  if (!signedIn && route.name !== "login") return redirectToLogin();
  if (signedIn && route.name === "login") return navigate("tasks");
  if (!VIEWS[route.name]) return navigate("tasks");

  showView(route);
  if (signedIn) loadMissingData().catch((error) => handleError(error));
}

// A token that's still in sessionStorage but past expires_at means the session ran out.
function redirectToLogin() {
  const expired = getToken() !== null;
  clearSession();
  navigate("login", expired ? { reason: "expired" } : {});
}

function showView(route) {
  const { view, title, shell } = VIEWS[route.name];
  closeTaskSidebar();
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
}

// ----- Global auth handlers (called from api.js) -----

let sessionEnding = false;

async function onUnauthorized() {
  if (sessionEnding) return;
  sessionEnding = true;
  // Don't yank the user out of the sidebar silently: tell them their edit was lost first.
  if (isTaskSidebarDirty()) {
    await openModal({
      title: "Your session has expired",
      message: "Your changes couldn't be saved. Sign in again to continue.",
      confirmLabel: "Sign in",
    });
  }
  endSession("expired");
  sessionEnding = false;
}

function onCanvasTokenRequired() {
  showBanner("canvas-token", "Canvas no longer accepts your saved access token. You're still signed in.", {
    kind: "warning",
    action: { label: "Reconnect Canvas", onClick: () => navigate("reconnect") },
  });
}

setAuthHandlers({ onUnauthorized, onCanvasTokenRequired });
subscribe(() => {
  renderShell();
  activeView?.update();
});
window.addEventListener("hashchange", onRouteChange);
document.getElementById("skip-link").addEventListener("click", () => viewRoot.focus());

// Wake the (possibly sleeping) Render service early. Failures surface on the real requests.
getHealth().catch(() => {});
onRouteChange();
