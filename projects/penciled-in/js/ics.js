// Build and download an .ics file from the local chunks (tasks only).
// Done entirely in the browser; works for guests with no API call.

const CRLF = '\r\n';

function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Lines are limited to 75 octets; continuation lines start with one space.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (bytes + len > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // the leading space on continuation lines counts too
    }
    cur += ch;
    bytes += len;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

export function buildIcs(chunks, tasks) {
  const titles = new Map(tasks.map((t) => [t.id, t]));
  const stamp = icsDate(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Penciled In//Schedule//EN', 'CALSCALE:GREGORIAN'];
  const sorted = [...chunks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const c of sorted) {
    const task = titles.get(c.task_id);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${c.id}@penciled-in`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(Date.parse(c.start))}`,
      `DTEND:${icsDate(Date.parse(c.end))}`,
      `SUMMARY:${escapeText(task ? task.title : 'Task work')}`,
    );
    if (task) lines.push(`DESCRIPTION:${escapeText(`Due ${new Date(task.due_at).toUTCString()}`)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

export function downloadIcs(chunks, tasks, filename = 'penciled-in-schedule.ics') {
  const blob = new Blob([buildIcs(chunks, tasks)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
