// Minimal iCalendar reader for D2L Brightspace / Google / Outlook feeds.
import { iso } from './dates.js';
import { TYPES } from './parse.js';

export function readIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let ev = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT') { if (ev) out.push(ev); ev = null; }
    else if (ev) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const [name, ...params] = l.slice(0, i).split(';');
      ev[name.toUpperCase()] = { v: l.slice(i + 1).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'), p: params.join(';') };
    }
  }
  return out.map((e) => {
    const s = e.DTSTART || e.DUE; if (!s) return null;
    const m = s.v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return null;
    let d, time = null;
    if (m[4]) {
      d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      if (time === '00:00') { d = new Date(d - 60000); time = '23:59'; } // "due at midnight" means end of the day before
    } else d = new Date(+m[1], +m[2] - 1, +m[3]);
    const summary = (e.SUMMARY?.v || '').trim();
    const extra = [e.LOCATION?.v, e.DESCRIPTION?.v, e.CATEGORIES?.v].filter(Boolean).join(' ');
    return { uid: e.UID?.v || summary + s.v, summary, extra, due: iso(d), time };
  }).filter(Boolean);
}

const COURSE = /\b([A-Z]{2,5})[\s-]?(\d{3,4}[A-Z]?)\b/;
// D2L puts the course in the title ("Assignment 1 - Due - PSYC 101 ...") or the location
export function toDeadlines(events) {
  return events.map((e) => {
    const all = e.summary + ' ' + e.extra;
    const cm = all.match(COURSE);
    const type = TYPES.find((t) => t.re.test(e.summary));
    const title = e.summary
      .replace(/\s*[-–:]\s*(due|availability ends|ends|end date|start date|starts)\b.*$/i, '')
      .replace(cm ? new RegExp('\\s*[-–:|]?\\s*' + cm[1] + '[\\s-]?' + cm[2] + '\\b.*$', 'i') : /$^/, '')
      .replace(/\b(due|is due)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || e.summary;
    const w = all.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    return { extUid: e.uid, title, type: (type || TYPES[TYPES.length - 1]).k, due: e.due, time: e.time, weight: w ? +w[1] : null, course: cm ? `${cm[1]} ${cm[2]}` : null, looksLikeWork: !!type || /\bdue\b/i.test(e.summary) };
  });
}
