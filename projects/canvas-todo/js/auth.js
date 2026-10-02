// Starting and ending a signed-in session in this tab.
import { saveSession, clearSession, getToken } from "./session.js";
import { logout } from "./api.js";
import { state, resetState } from "./state.js";
import { navigate } from "./router.js";
import { openModal, closeAllModals } from "./modal.js";
import { clearBanners } from "./notify.js";
import { closeTaskSidebar, isTaskSidebarDirty } from "./views/taskSidebar.js";

// Called with the POST /auth/token response. Always starts from empty state, so data from a
// previous account in this tab can never leak into the new one.
export function completeSignIn({ session_token, expires_at, user }) {
  // Reconnecting replaces a still-valid session; end the old one on the server rather than
  // leaving it alive. The request reads the old token synchronously, before it's replaced.
  if (getToken()) logout().catch(() => {});
  resetState();
  clearBanners();
  saveSession(session_token, expires_at);
  state.user = user;
  navigate("tasks");
}

// reason: expired | logged_out | disconnected | deleted (shown on the Login page)
export function endSession(reason) {
  clearSession();
  closeTaskSidebar();
  closeAllModals();
  clearBanners();
  resetState();
  navigate("login", { reason });
}

let expiring = false;

// The session ran out (a 401, or expires_at passed). If the user was mid-edit, tell them their
// changes weren't saved before leaving, instead of redirecting out from under them.
export async function expireSession() {
  if (expiring) return;
  expiring = true;
  if (isTaskSidebarDirty()) {
    await openModal({
      title: "Your session has expired",
      message: "Your changes couldn't be saved. Sign in again to continue.",
      confirmLabel: "Sign in",
    });
  }
  endSession("expired");
  expiring = false;
}
