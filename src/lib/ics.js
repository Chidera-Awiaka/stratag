import { addDays, fromIso, iso } from './dates.js';

const esc = (s) => String(s).replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
// RFC 5545 lines must be folded at 75 octets
const fold = (l) => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };

export function buildIcs(steps, courseName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ikiloop//Syllabus to Plan//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Study plan'];
  for (const s of steps) {
    const d = s.date.replace(/-/g, '');
    const label = (s.kind === 'due' ? 'DUE: ' : '') + s.text + (s.ctx ? ' (' + s.ctx + ')' : '');
    const summary = (courseName(s) ? courseName(s) + ' · ' : '') + label;
    lines.push('BEGIN:VEVENT', 'UID:' + s.id + '@ikiloop-plan', 'DTSTAMP:' + stamp);
    if (s.kind === 'due' && s.time) {
      const t = s.time.replace(':', '') + '00';
      lines.push('DTSTART:' + d + 'T' + t, 'DTEND:' + d + 'T' + t);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(summary), 'TRIGGER:-P1D', 'END:VALARM');
    } else {
      lines.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + iso(addDays(fromIso(s.date), 1)).replace(/-/g, ''));
    }
    lines.push(fold('SUMMARY:' + esc(summary)), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
