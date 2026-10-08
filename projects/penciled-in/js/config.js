// Backend selection.
// - Served from localhost: talk to a local backend on port 8000.
// - Anywhere else (GitHub Pages): talk to the deployed Render service.
// Set BACKEND_OVERRIDE to force a specific URL. Also add it to connect-src in index.html.
export const RENDER_URL = 'https://one5113-project2-penciled-in.onrender.com';
export const LOCAL_URL = 'http://localhost:8000';
const BACKEND_OVERRIDE = null;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
export const BACKEND_URL =
  BACKEND_OVERRIDE || (LOCAL_HOSTS.includes(location.hostname) ? LOCAL_URL : RENDER_URL);

export const STORAGE = {
  token: 'penciled-in:token',
  guest: 'penciled-in:guest',
  pending: 'penciled-in:pending',
};

// Request limits from the spec, checked before calling POST /schedule.
export const LIMITS = { tasks: 200, blocks: 500, lockedChunks: 2000, calendars: 100 };

export const SYNC_DEBOUNCE_MS = 2000;
export const SLOW_REQUEST_MS = 2500; // show "waking up the server" after this long
export const REQUEST_TIMEOUT_MS = 90000; // cold starts can take about a minute
export const KEEPALIVE_MAX_BYTES = 60000; // browsers cap keepalive bodies near 64 KB

// Chunks start on a 15-minute grid.
export const GRID_MIN = 15;
