import { login } from '../actions.js';
import { clear, h } from '../dom.js';
import { describeRule } from '../rrule.js';
import { deleteBlock, setFocusDay, state, subscribe } from '../store.js';
import { DAY_MIN, dayOfWall, fmtClock, fmtDayLong, fmtWall, utcToWall } from '../time.js';
import { blockHue } from '../util.js';
import { openBlockForm } from './blockForm.js';
import { confirmDialog } from './modal.js';
import { showCalendarPane } from './tasksPanel.js';

function whenText(block, tz) {
  const s = utcToWall(Date.parse(block.start), tz);
  const e = utcToWall(Date.parse(block.end), tz);
  const sd = dayOfWall(s);
  if (sd === dayOfWall(e)) return `${fmtDayLong(sd)} · ${fmtClock(s - sd * DAY_MIN)} to ${fmtClock(e - sd * DAY_MIN)}`;
  return `${fmtWall(s)} to ${fmtWall(e)}`;
}

export function mountBlocks(root) {
  const list = h('ul', { class: 'items' });
  const empty = h('p', { class: 'empty', text: 'Nothing blocked yet. Add sleep, meals, classes, or anything else you are not free for.' });
  const guestHint = h(
    'div',
    { class: 'hint-card' },
    h('p', { text: 'Log in with Google to also avoid events from your Google calendars.' }),
    h('button', { class: 'btn btn-sm', type: 'button', text: 'Log in with Google', onclick: login }),
  );
  root.append(
    h(
      'div',
      { class: 'panel-head' },
      h('p', { class: 'panel-sub', text: 'When you are not free' }),
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: '+ Add block', onclick: () => openBlockForm() }),
    ),
    empty,
    list,
    guestHint,
  );

  const render = () => {
    const tz = state.settings.timezone;
    clear(list);
    guestHint.hidden = state.mode !== 'guest';
    empty.hidden = state.blocks.length > 0 || state.loading;
    if (state.loading) {
      list.append(h('li', { class: 'empty', text: 'Loading your blocks…' }));
      return;
    }
    const sorted = [...state.blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    for (const b of sorted) {
      const name = b.title || 'Unavailable';
      list.append(
        h(
          'li',
          { class: 'item', style: { '--h': blockHue(b.id) } },
          h('span', { class: 'swatch block-swatch', 'aria-hidden': 'true' }),
          h(
            'div',
            { class: 'item-main' },
            h('button', {
              class: 'item-title',
              type: 'button',
              title: 'Show on calendar',
              text: name,
              onclick: () => {
                setFocusDay(dayOfWall(utcToWall(Date.parse(b.start), tz)));
                showCalendarPane();
              },
            }),
            h('div', { class: 'item-meta', text: whenText(b, tz) }),
            b.rrule ? h('div', { class: 'item-meta', text: describeRule(b.rrule) }) : null,
          ),
          h(
            'div',
            { class: 'item-actions' },
            h('button', { class: 'btn btn-sm', type: 'button', text: 'Edit', 'aria-label': `Edit ${name}`, onclick: () => openBlockForm(b) }),
            h('button', {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              text: 'Delete',
              'aria-label': `Delete ${name}`,
              onclick: async () => {
                const { ok } = await confirmDialog({
                  title: 'Delete this block?',
                  message: b.rrule ? `"${name}" and all of its repeats will be removed.` : `"${name}" will be removed.`,
                  confirmLabel: 'Delete block',
                  danger: true,
                });
                if (ok) deleteBlock(b.id);
              },
            }),
          ),
        ),
      );
    }
  };

  subscribe(['data', 'auth'], render);
  render();
}
