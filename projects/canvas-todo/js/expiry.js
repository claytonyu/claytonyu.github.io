// Warns before the session's fixed expires_at, and ends the session once it passes.
// Checked on load, every 30 seconds, and when the tab becomes visible again (timers are
// throttled in background tabs).
import { getExpiresAt } from "./session.js";
import { openModal } from "./modal.js";
import { expireSession } from "./auth.js";

const WARN_BEFORE_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
let warnedFor = null; // expires_at already warned about, so each session warns once

function check() {
  const expiresAt = getExpiresAt();
  if (!expiresAt) return;
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) {
    expireSession();
  } else if (remaining <= WARN_BEFORE_MS && warnedFor !== expiresAt.getTime()) {
    warnedFor = expiresAt.getTime();
    warn(remaining);
  }
}

function warn(remaining) {
  const minutes = Math.max(1, Math.round(remaining / 60000));
  openModal({
    title: "Your session is about to end",
    message: `You'll be signed out in about ${minutes} minute${minutes === 1 ? "" : "s"}. Save anything you're working on. To continue after that, sign in again with a Canvas access token.`,
    confirmLabel: "OK",
  });
}

export function startExpiryWatch() {
  check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
