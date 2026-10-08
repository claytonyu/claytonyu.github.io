// Session token handling (bearer token in localStorage, per SPEC.md).
import { BACKEND_URL, STORAGE } from './config.js';

export function getToken() {
  try {
    return localStorage.getItem(STORAGE.token);
  } catch {
    return null;
  }
}
export function setToken(token) {
  try {
    localStorage.setItem(STORAGE.token, token);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(STORAGE.token);
  } catch {
    /* ignore */
  }
}

// After Google login the backend redirects to <frontend>/#token=... or #login_error=...
// Read it, then clear the fragment so the token never lingers in the URL or history.
export function consumeHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const token = params.get('token');
  const loginError = params.get('login_error');
  if (!token && !loginError) return {};
  history.replaceState(null, '', location.pathname + location.search);
  return { token: token || null, loginError: loginError || null };
}

// A full-page navigation, not fetch (the flow redirects through Google).
export function startLogin() {
  window.location.assign(`${BACKEND_URL}/auth/google/login`);
}

const LOGIN_ERRORS = {
  access_denied: 'Google sign-in was cancelled. You can try again whenever you like.',
  invalid_state: 'That sign-in attempt expired. Please try again.',
  reauth_required: 'Google needs you to sign in again.',
  google_unavailable: "Couldn't reach Google. Please try again in a moment.",
  not_configured: "Google sign-in isn't set up on the server yet. You can keep using Penciled In as a guest.",
};
export const loginErrorMessage = (code) => LOGIN_ERRORS[code] || 'Sign-in did not complete. Please try again.';
