// Backend base URL, picked from the hostname so local testing never touches production.
// If you change the production URL, also update connect-src in index.html's Content-Security-Policy.
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export const BACKEND_URL = LOCAL_HOSTS.includes(location.hostname)
  ? "http://localhost:8080"
  : "https://one5113-hw4-backend.onrender.com";

export const CANVAS_TOKEN_URL = "https://canvas.cmu.edu/profile/settings#access_tokens_holder";
