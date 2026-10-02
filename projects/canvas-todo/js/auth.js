// Starting and ending a signed-in session in this tab.
import { saveSession, clearSession } from "./session.js";
import { state, resetState } from "./state.js";
import { navigate } from "./router.js";
import { closeAllModals } from "./modal.js";
import { clearBanners } from "./notify.js";
import { closeTaskSidebar } from "./views/taskSidebar.js";

// Called with the POST /auth/token response. Always starts from empty state, so data from a
// previous account in this tab can never leak into the new one.
export function completeSignIn({ session_token, expires_at, user }) {
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
