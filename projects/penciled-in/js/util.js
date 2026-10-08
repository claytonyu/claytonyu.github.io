export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function hashString(s) {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export const pad2 = (n) => String(n).padStart(2, '0');

// Task chunks use calmer hues; blocks use stronger ones so they stand out.
const TASK_HUES = [145, 205, 38, 275, 345, 85, 180, 320];
const BLOCK_HUES = [8, 28, 48, 165, 190, 255, 295, 330];
export const EVENT_HUE = 215;

export const taskHue = (id) => TASK_HUES[hashString(id) % TASK_HUES.length];
export const blockHue = (id) => BLOCK_HUES[hashString(id) % BLOCK_HUES.length];
