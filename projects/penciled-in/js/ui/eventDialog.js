// Click an imported Google event: dismiss it (this event or the whole series) or restore it.
// Dismissal only happens inside Penciled In. The event stays in Google Calendar.
import { h } from '../dom.js';
import { dismissalsFor, dismissEvent, restoreDismissals, state } from '../store.js';
import { fmtInstant } from '../time.js';
import { closeModal, openModal } from './modal.js';

export function openEventDialog(ev) {
  const tz = state.settings.timezone;
  const cal = state.calendars.find((c) => c.id === ev.calendar_id);
  const active = dismissalsFor(ev);
  const when = `${fmtInstant(Date.parse(ev.start), tz)} to ${fmtInstant(Date.parse(ev.end), tz)}`;

  const actions = [];
  if (active.length) {
    // A series dismissal covers every instance, so restoring it is a separate, clearly
    // labelled choice. It must not be bundled into restoring just this event.
    const single = active.filter((d) => d.scope === 'occurrence');
    const series = active.filter((d) => d.scope === 'series');
    const restoreButton = (text, dismissals, primary) =>
      h('button', {
        class: primary ? 'btn btn-primary' : 'btn',
        type: 'button',
        text,
        onclick: () => {
          restoreDismissals(dismissals.map((d) => d.id));
          closeModal();
        },
      });
    if (single.length) actions.push(restoreButton('Stop ignoring this event (block this time again)', single, true));
    if (series.length) {
      actions.push(restoreButton('Stop ignoring every event in this series', series, !single.length));
    }
  } else {
    actions.push(
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Ignore this event',
        onclick: () => {
          dismissEvent(ev, 'occurrence');
          closeModal();
        },
      }),
    );
    if (ev.recurring_event_id) {
      actions.push(
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Ignore every event in this series',
          onclick: () => {
            dismissEvent(ev, 'series');
            closeModal();
          },
        }),
      );
    }
  }
  actions.push(h('button', { class: 'btn btn-ghost', type: 'button', text: 'Close', onclick: closeModal }));

  openModal({
    title: ev.title || 'Google Calendar event',
    content: [
      h('p', { class: 'modal-message', text: when }),
      cal ? h('p', { class: 'hint', text: `From ${cal.name}` }) : null,
      active.length
        ? h('p', { class: 'modal-message', text: `Ignored, so the scheduler may use this time${active.some((d) => d.scope === 'series') ? ' (whole series)' : ''}.` })
        : h('p', { class: 'modal-message', text: 'Penciled In avoids this time. Ignoring it only changes Penciled In; the event stays in Google Calendar.' }),
      h('div', { class: 'modal-actions stack' }, actions),
    ],
  });
}
