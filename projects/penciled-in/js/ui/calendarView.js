// The week/day calendar. Everything is positioned in local wall-clock minutes of
// settings.timezone, so a 23:00 to 07:00 sleep block looks the same every night, DST or not.
//
// Chunks: click = toggle lock. Drag = move, bottom edge = resize (both snap to 15 minutes and lock).
// Keyboard: Enter/Space toggles lock, arrows move, Shift+arrows resize, Delete removes.
import { GRID_MIN } from '../config.js';
import { busyItems } from '../busy.js';
import { clear, h } from '../dom.js';
import { chunkIssues, describeIssues } from '../issues.js';
import {
  deleteChunk,
  goToday,
  setViewMode,
  shiftView,
  state,
  subscribe,
  toggleChunkLock,
  updateChunk,
  viewRange,
} from '../store.js';
import {
  DAY_MIN,
  fmtClock,
  fmtDayLong,
  fmtDom,
  fmtDow,
  fmtInstant,
  fmtRangeTitle,
  fmtWall,
  parseHM,
  todayDay,
  utcToWall,
  wallToUtc,
} from '../time.js';
import { blockHue, clamp, EVENT_HUE, taskHue } from '../util.js';
import { openBlockForm } from './blockForm.js';
import { openEventDialog } from './eventDialog.js';
import { showToast } from './toast.js';

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
const snap = (min) => Math.round(min / GRID_MIN) * GRID_MIN;
const px = (n) => `${n}px`;

let scroller;
let titleEl;
let dayBtn;
let weekBtn;
let bodyEl = null;
let nowLine = null; // { el, day }
let dragging = false;
let pendingRender = false;
let scrolledOnce = false;

export function mountCalendar(root) {
  document.documentElement.style.setProperty('--hour-h', px(HOUR_PX));
  if (window.matchMedia('(max-width: 900px)').matches) state.view.mode = 'day';

  titleEl = h('h2', { class: 'cal-title', 'aria-live': 'polite' });
  dayBtn = h('button', { class: 'seg-btn', type: 'button', text: 'Day', onclick: () => setViewMode('day') });
  weekBtn = h('button', { class: 'seg-btn', type: 'button', text: 'Week', onclick: () => setViewMode('week') });
  scroller = h('div', { class: 'cal-scroll' });

  const legendItem = (cls, text) => h('li', {}, h('span', { class: `lg ${cls}`, 'aria-hidden': 'true' }), text);
  root.append(
    h(
      'div',
      { class: 'cal-toolbar' },
      h(
        'div',
        { class: 'cal-nav' },
        h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Previous', text: '‹', onclick: () => shiftView(-1) }),
        h('button', { class: 'btn btn-sm', type: 'button', text: 'Today', onclick: goToday }),
        h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Next', text: '›', onclick: () => shiftView(1) }),
      ),
      titleEl,
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Calendar view' }, dayBtn, weekBtn),
    ),
    scroller,
    h(
      'ul',
      { class: 'legend', 'aria-label': 'Legend' },
      legendItem('lg-proposed', 'Proposed (click to lock)'),
      legendItem('lg-locked', 'Locked'),
      legendItem('lg-block', 'Blocked time'),
      legendItem('lg-event', 'Google event'),
      legendItem('lg-pad', 'Padding'),
    ),
    h('p', {
      id: 'chunk-help',
      class: 'sr-only',
      text: 'Press Enter to lock or unlock. Arrow up and down move by 15 minutes, left and right move by a day. Shift plus arrow up or down changes the length. Delete removes it.',
    }),
  );

  subscribe(['data', 'view', 'auth'], render);
  setInterval(tickNow, 60000);
  render();
}

// ---- Geometry helpers ----

// The parts of [startMs, endMs) that fall on each visible day, in minutes within that day.
function segments(startMs, endMs, first, n, tz) {
  const sw = utcToWall(startMs, tz);
  const ew = utcToWall(endMs, tz);
  const out = [];
  if (ew <= sw) return out;
  for (let i = 0; i < n; i++) {
    const ds = (first + i) * DAY_MIN;
    const de = ds + DAY_MIN;
    const a = Math.max(sw, ds);
    const b = Math.min(ew, de);
    if (b > a) out.push({ i, top: a - ds, bottom: b - ds, contBefore: sw < ds, contAfter: ew > de });
  }
  return out;
}

// Side-by-side lanes for chunks that overlap in time (possible after manual edits).
function layoutLanes(segs) {
  segs.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  let cluster = [];
  let clusterEnd = -1;
  let laneEnds = [];
  const close = () => {
    for (const s of cluster) s.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const s of segs) {
    if (cluster.length && s.top >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = s.bottom;
    s.lane = lane;
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.bottom);
  }
  close();
}

const place = (seg) => ({ top: px(seg.top * PX_PER_MIN), height: px(Math.max((seg.bottom - seg.top) * PX_PER_MIN, 4)) });

// ---- Rendering ----

function updateToolbar(first, n) {
  titleEl.textContent = fmtRangeTitle(first, first + n - 1);
  dayBtn.setAttribute('aria-pressed', String(state.view.mode === 'day'));
  weekBtn.setAttribute('aria-pressed', String(state.view.mode === 'week'));
}

function render() {
  if (dragging) {
    pendingRender = true; // never rebuild the DOM under an active drag
    return;
  }
  pendingRender = false;
  const tz = state.settings.timezone;
  const { first, n } = viewRange();
  updateToolbar(first, n);

  const prevScroll = scroller.scrollTop;
  const focusedId = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest('[data-chunk-id]')?.dataset.chunkId
    : null;

  const fromMs = wallToUtc((first - 1) * DAY_MIN, tz);
  const toMs = wallToUtc((first + n + 1) * DAY_MIN, tz);
  const workStart = parseHM(state.settings.work_start);
  const workEnd = parseHM(state.settings.work_end);
  const today = todayDay(tz);

  const buckets = Array.from({ length: n }, () => ({ pads: [], busy: [], chunks: [] }));

  for (const item of busyItems(state, fromMs, toMs, { includeDismissed: true })) {
    if (item.padMin > 0 && !item.dismissed) {
      const pad = item.padMin * 60000;
      for (const seg of segments(item.start - pad, item.start, first, n, tz)) buckets[seg.i].pads.push({ seg, item });
      for (const seg of segments(item.end, item.end + pad, first, n, tz)) buckets[seg.i].pads.push({ seg, item });
    }
    for (const seg of segments(item.start, item.end, first, n, tz)) buckets[seg.i].busy.push({ seg, item });
  }

  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  for (const chunk of state.chunks) {
    const s = Date.parse(chunk.start);
    const e = Date.parse(chunk.end);
    const sw = utcToWall(s, tz);
    const ew = utcToWall(e, tz);
    for (const seg of segments(s, e, first, n, tz)) {
      buckets[seg.i].chunks.push({ seg, chunk, task: tasks.get(chunk.task_id), sw, ew, dayIndex: seg.i, dayWall: (first + seg.i) * DAY_MIN, first });
    }
  }
  for (const b of buckets) layoutLanes(b.chunks.map((c) => c.seg));

  const issues = chunkIssues(state);
  nowLine = null;

  const head = h(
    'div',
    { class: 'cal-head', style: { '--days': n } },
    h('div', { class: 'gutter-cell' }),
    ...buckets.map((_, i) => {
      const day = first + i;
      return h(
        'div',
        { class: `day-head${day === today ? ' today' : ''}` },
        h('span', { class: 'dow', text: fmtDow(day) }),
        h('span', { class: 'dom', text: fmtDom(day) }),
      );
    }),
  );

  const gutter = h('div', { class: 'time-gutter', 'aria-hidden': 'true' });
  for (let hr = 1; hr < 24; hr++) {
    gutter.append(h('div', { class: 'hour-label', style: { top: px(hr * HOUR_PX) }, text: fmtClock(hr * 60) }));
  }

  const cols = buckets.map((b, i) => {
    const day = first + i;
    const col = h('div', { class: `day-col${day === today ? ' today' : ''}`, role: 'group', 'aria-label': fmtDayLong(day) });
    if (workStart > 0) col.append(shade(0, workStart));
    if (workEnd < DAY_MIN) col.append(shade(workEnd, DAY_MIN));
    for (const { seg, item } of b.pads) col.append(padEl(seg, item));
    for (const { seg, item } of b.busy) col.append(busyEl(seg, item, tz));
    for (const ctx of b.chunks) col.append(chunkEl(ctx, issues, tz));
    if (day === today) {
      const el = h('div', { class: 'now-line', 'aria-hidden': 'true', style: { top: px((utcToWall(Date.now(), tz) - day * DAY_MIN) * PX_PER_MIN) } });
      col.append(el);
      nowLine = { el, day };
    }
    return col;
  });

  bodyEl = h('div', { class: 'cal-body', style: { '--days': n } }, gutter, ...cols);
  clear(scroller);
  scroller.append(head, bodyEl);

  if (!scrolledOnce) {
    scrolledOnce = true;
    scroller.scrollTop = Math.max(0, ((Number.isNaN(workStart) ? 8 * 60 : workStart) - 90) * PX_PER_MIN);
  } else {
    scroller.scrollTop = prevScroll;
  }
  if (focusedId) {
    const again = bodyEl.querySelector(`[data-chunk-id="${CSS.escape(focusedId)}"]`);
    if (again) again.focus({ preventScroll: true });
  }
}

function tickNow() {
  if (!nowLine || dragging) return;
  const tz = state.settings.timezone;
  const minutes = utcToWall(Date.now(), tz) - nowLine.day * DAY_MIN;
  if (minutes < 0 || minutes >= DAY_MIN) render();
  else nowLine.el.style.setProperty('top', px(minutes * PX_PER_MIN));
}

function shade(from, to) {
  return h('div', { class: 'shade', 'aria-hidden': 'true', style: { top: px(from * PX_PER_MIN), height: px((to - from) * PX_PER_MIN) } });
}

function padEl(seg, item) {
  return h('div', {
    class: `pad ${item.kind === 'event' ? 'event' : 'block'}`,
    'aria-hidden': 'true',
    style: { '--h': item.kind === 'event' ? EVENT_HUE : blockHue(item.id), ...place(seg) },
  });
}

function busyEl(seg, item, tz) {
  const isEvent = item.kind === 'event';
  const range = `${fmtInstant(item.start, tz)} to ${fmtInstant(item.end, tz)}`;
  let action = 'Click to edit';
  if (isEvent) action = item.dismissed ? 'Ignored. Click to restore' : 'Click to ignore';
  const tall = (seg.bottom - seg.top) * PX_PER_MIN >= 34;
  return h(
    'button',
    {
      class: ['busy', isEvent ? 'event' : 'block', item.dismissed ? 'dismissed' : '', seg.contBefore ? 'cont-before' : '', seg.contAfter ? 'cont-after' : '']
        .filter(Boolean)
        .join(' '),
      type: 'button',
      title: `${item.title}\n${range}\n${action}`,
      'aria-label': `${isEvent ? 'Google event' : 'Unavailable'}: ${item.title}, ${range}${item.dismissed ? ', ignored' : ''}. ${action}.`,
      style: { '--h': isEvent ? EVENT_HUE : blockHue(item.id), ...place(seg) },
      onclick: () => (isEvent ? openEventDialog(item.ref) : openBlockForm(item.ref)),
    },
    h('span', { class: 'busy-title', text: item.title }),
    tall ? h('span', { class: 'busy-time', text: `${fmtClock(seg.top)} to ${fmtClock(seg.bottom)}` }) : null,
  );
}

function chunkEl(ctx, issues, tz) {
  const { seg, chunk, task, sw, ew } = ctx;
  const issue = issues.get(chunk.id);
  const name = task ? task.title : 'Task work';
  const tall = (seg.bottom - seg.top) * PX_PER_MIN >= 34;
  const lanes = seg.lanes || 1;
  const timeText = `${fmtClock(seg.top)} to ${fmtClock(seg.bottom)}`;
  const status = chunk.locked ? 'locked' : 'proposed';
  const endClock = fmtClock(ew - Math.floor((ew - 1) / DAY_MIN) * DAY_MIN);

  const timeEl = tall ? h('div', { class: 'chunk-time', text: timeText }) : null;
  const el = h(
    'div',
    {
      class: `chunk ${chunk.locked ? 'locked' : 'unlocked'}${issue ? ' has-issue' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-pressed': chunk.locked,
      'aria-describedby': 'chunk-help',
      'aria-label': `${name}, ${fmtWall(sw)} to ${endClock}, ${status}${issue ? `. Warning: ${describeIssues(issue)}` : ''}`,
      title: `${name}\n${timeText}${issue ? `\nHeads up: ${describeIssues(issue)}` : ''}`,
      dataset: { chunkId: chunk.id },
      style: {
        '--h': taskHue(chunk.task_id),
        ...place(seg),
        left: `calc(${(seg.lane * 100) / lanes}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      },
    },
    h(
      'div',
      { class: 'chunk-title' },
      chunk.locked ? h('span', { class: 'icon', 'aria-hidden': 'true', text: '🔒' }) : null,
      issue ? h('span', { class: 'icon warn', 'aria-hidden': 'true', text: '⚠' }) : null,
      name,
    ),
    timeEl,
    h('button', {
      class: 'chunk-del',
      type: 'button',
      tabindex: '-1',
      'aria-hidden': 'true',
      title: 'Delete this chunk',
      text: '×',
      onclick: (e) => {
        e.stopPropagation();
        deleteChunk(chunk.id);
      },
    }),
    h('div', { class: 'resize-handle', 'aria-hidden': 'true' }),
  );
  wireChunk(el, ctx, timeEl, tz);
  return el;
}

// ---- Chunk interaction ----

function commitChunk(chunk, startMs, endMs) {
  updateChunk(chunk.id, { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), locked: true });
  const issue = chunkIssues(state).get(chunk.id);
  if (issue) showToast(`Heads up: this chunk ${describeIssues(issue)}. It was kept where you put it.`);
}

function wireChunk(el, ctx, timeEl, tz) {
  const { chunk, seg, sw, ew, dayIndex, dayWall } = ctx;
  const startMs = Date.parse(chunk.start);
  const endMs = Date.parse(chunk.end);
  const durWall = ew - sw;
  const singleDay = Math.floor(sw / DAY_MIN) === Math.floor((ew - 1) / DAY_MIN);
  let drag = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.chunk-del')) return;
    const cols = [...bodyEl.querySelectorAll('.day-col')].map((c) => c.getBoundingClientRect());
    drag = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      resizing: e.target.classList.contains('resize-handle'),
      moved: false,
      cols,
      next: null,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer already ended; the drag then only tracks while it stays over the chunk */
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, dy) < 5) return;
      drag.moved = true;
      dragging = true;
      el.classList.add('dragging');
    }
    if (drag.resizing) {
      const dayEnd = (Math.floor(sw / DAY_MIN) + 1) * DAY_MIN;
      const newEnd = clamp(snap(ew + dy / PX_PER_MIN), sw + GRID_MIN, Math.max(dayEnd, ew));
      el.style.setProperty('height', px(Math.max((newEnd - dayWall - seg.top) * PX_PER_MIN, 6)));
      if (timeEl) timeEl.textContent = `${fmtClock(seg.top)} to ${fmtClock(newEnd - dayWall)}`;
      drag.next = { start: sw, end: newEnd };
      return;
    }
    let ci = drag.cols.findIndex((r) => e.clientX >= r.left && e.clientX < r.right);
    if (ci < 0) ci = e.clientX < drag.cols[0].left ? 0 : drag.cols.length - 1;
    const dDay = ci - dayIndex;
    let newStart = snap(sw + dy / PX_PER_MIN) + dDay * DAY_MIN;
    if (singleDay && durWall <= DAY_MIN) {
      const dayStart = Math.floor(sw / DAY_MIN) * DAY_MIN + dDay * DAY_MIN;
      newStart = clamp(newStart, dayStart, dayStart + DAY_MIN - durWall);
    }
    const shiftY = (newStart - dDay * DAY_MIN - sw) * PX_PER_MIN;
    const shiftX = drag.cols[ci].left - drag.cols[dayIndex].left;
    el.style.setProperty('transform', `translate(${shiftX}px, ${shiftY}px)`);
    if (timeEl) {
      const day = Math.floor(newStart / DAY_MIN);
      timeEl.textContent = `${fmtClock(newStart - day * DAY_MIN)} to ${fmtClock(newStart + durWall - day * DAY_MIN)}`;
    }
    drag.next = { start: newStart, end: newStart + durWall };
  });

  const finish = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.classList.remove('dragging');
    el.style.removeProperty('transform');
    dragging = false;
    if (!cancelled) {
      if (!d.moved) {
        toggleChunkLock(chunk.id);
      } else if (d.next && (d.next.start !== sw || d.next.end !== ew)) {
        const newStartMs = d.resizing ? startMs : wallToUtc(d.next.start, tz);
        const newEndMs = d.resizing ? wallToUtc(d.next.end, tz) : newStartMs + (endMs - startMs);
        commitChunk(chunk, newStartMs, newEndMs);
      }
    }
    if (pendingRender) render();
    else if (d.moved) render(); // snap the element back if nothing was committed
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));

  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    const quarter = GRID_MIN * 60000;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        toggleChunkLock(chunk.id);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        deleteChunk(chunk.id);
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.shiftKey) {
          if (endMs + dir * quarter - startMs >= quarter) commitChunk(chunk, startMs, endMs + dir * quarter);
        } else {
          commitChunk(chunk, startMs + dir * quarter, endMs + dir * quarter);
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const s = wallToUtc(sw + dir * DAY_MIN, tz);
        commitChunk(chunk, s, s + (endMs - startMs));
        break;
      }
      default:
    }
  });
}
