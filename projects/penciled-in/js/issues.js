// Live placement checks. The backend accepts any chunk placement, so "warn, do not block"
// is our job: flag chunks that overlap a block/event (padding included) or end after the deadline.
import { busyItems } from './busy.js';
import { fmtInstant } from './time.js';

let cache = { version: -1, map: new Map() };

// Map of chunk id -> { overlaps: string[], late: boolean }. Memoized per state version.
export function chunkIssues(state) {
  if (cache.version === state.version) return cache.map;
  const map = new Map();
  if (state.chunks.length) {
    let min = Infinity;
    let max = -Infinity;
    for (const c of state.chunks) {
      min = Math.min(min, Date.parse(c.start));
      max = Math.max(max, Date.parse(c.end));
    }
    const busy = busyItems(state, min, max);
    const tasks = new Map(state.tasks.map((t) => [t.id, t]));
    for (const c of state.chunks) {
      const s = Date.parse(c.start);
      const e = Date.parse(c.end);
      const hits = busy.filter((b) => s < b.end + b.padMin * 60000 && e > b.start - b.padMin * 60000);
      const task = tasks.get(c.task_id);
      const late = !!task && e > Date.parse(task.due_at);
      if (hits.length || late) {
        map.set(c.id, { overlaps: [...new Set(hits.map((b) => b.title))], late });
      }
    }
  }
  cache = { version: state.version, map };
  return map;
}

export function describeIssues(issue) {
  const parts = [];
  if (issue.overlaps.length) parts.push(`overlaps ${issue.overlaps.join(', ')}`);
  if (issue.late) parts.push('ends after the deadline');
  return parts.join(' and ');
}

export function chunkLabel(state, chunk) {
  const task = state.tasks.find((t) => t.id === chunk.task_id);
  return `${task ? task.title : 'Task work'} on ${fmtInstant(Date.parse(chunk.start), state.settings.timezone)}`;
}
