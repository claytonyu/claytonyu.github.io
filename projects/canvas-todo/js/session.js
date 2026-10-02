// Session token storage. sessionStorage only (never localStorage), so it clears when the tab closes.
// The Canvas PAT is never stored here or anywhere else.
const TOKEN_KEY = "canvasTodo.sessionToken";
const EXPIRES_KEY = "canvasTodo.expiresAt";

export function saveSession(token, expiresAt) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRES_KEY, expiresAt);
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getExpiresAt() {
  const value = sessionStorage.getItem(EXPIRES_KEY);
  return value ? new Date(value) : null;
}

export function hasSession() {
  const expiresAt = getExpiresAt();
  return getToken() !== null && expiresAt !== null && expiresAt > new Date();
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
}
