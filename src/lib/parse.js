// Turns syllabus text into deadlines. Rules only, no AI, so it is free and instant.
// Handles: "Jan 20", "January 20th, 2027", "20 Jan", "2027-01-20", "1/20", "20/01/2027",
// "Week 5" (+ optional weekday) relative to the term start, times like "11:59 pm",
// grade weights "(25%)" and table rows from PDFs.

import { iso, addDays, fromIso } from './dates.js';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DOWS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;
const reMonthDay = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])(?:,?\\s*(20\\d{2}))?`, 'i');
const reDayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b\\.?(?:,?\\s*(20\\d{2}))?`, 'i');
const reSlash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const reWeek = /\bweek\s*(\d{1,2})\b/i;
const reDow = /\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b\.?/i;
const reTime = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b|\b(\d{1,2}):(\d{2})\b/i;
const reWeight = /(\d{1,3}(?:\.\d+)?)\s*%/;

// lines that mention a date but are not work
const SKIP = /\b(no class(es)?|holiday|reading week|study break|break|university closed|college closed|family day|office hours?|last day to (drop|add|withdraw)|classes (begin|start|end)|lecture|tutorial room)\b/i;

const SKIPG = new RegExp(SKIP.source, 'gi');
const POLICY = /\b(will not be accepted|late penalty|penalty of|verification of illness|travel plans|exam period runs|last day of classes|outline (last )?updated)\b/i;

export const TYPES = [
  { k: 'exam', re: /\b(final exam|midterm|exam|test|final(?=\s*($|[|:(,\d])))/i, label: 'Exam',
    plan: [[-10, 'List every topic for {t}'], [-7, 'Make a one-page summary sheet'], [-5, 'Practice questions, circle weak spots'], [-3, 'Hit the weak spots + flashcards'], [-1, 'Light review, sleep early']] },
  { k: 'quiz', re: /\bquiz(zes)?\b/i, label: 'Quiz',
    plan: [[-3, 'Skim the chapters for {t}'], [-1, 'Flashcards or practice questions']] },
  { k: 'paper', re: /\b(paper|essay|report|thesis|write-?up|proposal|case study)\b/i, label: 'Writing',
    plan: [[-14, 'Read the prompt for {t}, pick a topic'], [-11, 'Find 5 sources, take notes'], [-8, 'Outline it'], [-5, 'Ugly first draft'], [-2, 'Revise, cite, proofread'], [-1, 'Final read and submit early']] },
  { k: 'pres', re: /\b(presentation|present|pitch|demo|poster)\b/i, label: 'Presentation',
    plan: [[-7, 'Split up who does what for {t}'], [-4, 'Build the slides'], [-2, 'Rehearse twice, time it']] },
  { k: 'project', re: /\b(project|portfolio|lab|milestone|deliverable|prototype)\b/i, label: 'Project / lab',
    plan: [[-9, 'Read the requirements for {t}, list deliverables'], [-6, 'Main work, part 1'], [-3, 'Main work, part 2'], [-1, 'Polish and submit']] },
  { k: 'read', re: /\b(reading|response|reflection|journal|discussion|forum|post|worksheet)\b/i, label: 'Short task',
    plan: [[-2, 'Do the reading for {t}'], [-1, 'Write it up and submit']] },
  { k: 'asg', re: /\b(assignment|homework|hw|problem set|pset|due|submit|submission|test)\b/i, label: 'Assignment',
    plan: [[-5, 'Open {t}, knock out the easy parts'], [-3, 'Do the hard parts'], [-1, 'Check it and submit']] },
];
export const typeOf = (k) => TYPES.find((t) => t.k === k) || TYPES[TYPES.length - 1];

// Year comes from the term: a date more than ~2 months before the term starts belongs to next year.
function withYear(m, d, y, termStart) {
  if (y) { y = +y; if (y < 100) y += 2000; return new Date(y, m, d); }
  const ref = termStart ? fromIso(termStart) : new Date();
  let dt = new Date(ref.getFullYear(), m, d);
  if (dt < addDays(ref, -75)) dt = new Date(ref.getFullYear() + 1, m, d);
  if (dt > addDays(ref, 300)) dt = new Date(ref.getFullYear() - 1, m, d);
  return dt;
}

const valid = (dt, m, d) => dt && dt.getMonth() === m && dt.getDate() === d;

export function findDate(line, termStart, opts = {}) {
  const all = [];
  let rest = line, off = 0;
  for (let k = 0; k < 6; k++) {
    const f = findDate1(rest, termStart, opts);
    if (!f) break;
    const at = rest.indexOf(f.raw);
    all.push({ ...f, at: off + at });
    if (f.fromWeek) break;
    rest = rest.slice(at + f.raw.length); off += at + f.raw.length;
    // range end: "Jan 18-22" / "March 15–19" / "April 14 - 26"
    const r = rest.match(/^\s*[-–]\s*(\d{1,2})\b(?![\/:])/);
    if (r) { const d = new Date(f.date); d.setDate(+r[1]); if (d > f.date) { all[all.length - 1].end = d; all[all.length - 1].raw2 = f.raw + rest.slice(0, r[0].length); } rest = rest.slice(r[0].length); off += r[0].length; }
  }
  if (!all.length) return null;
  if (all.length === 1) { const a = all[0]; return a.end ? { date: a.end, raw: a.raw2, fromRange: true } : a; }
  // prefer the date right after a due word, else the one that isn't a schedule-range header, else the last
  const dueAt = [...line.matchAll(/\b(due|by|deadline|closes?|submit(ted)?)\b/gi)].map((m) => m.index);
  let pick = all.find((a) => dueAt.some((i) => a.at > i && a.at - i < 30));
  if (!pick) pick = [...all].reverse().find((a) => !a.end) || all[all.length - 1];
  return pick.end ? { date: pick.end, raw: pick.raw2, fromRange: true, all } : { ...pick, all };
}

function findDate1(line, termStart, opts) {
  let m;
  if ((m = line.match(reIso))) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    if (valid(dt, +m[2] - 1, +m[3])) return { date: dt, raw: m[0] };
  }
  if ((m = line.match(reMonthDay))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const dt = withYear(mo, +m[2], m[3], termStart);
    if (valid(dt, mo, +m[2])) return { date: dt, raw: m[0] };
  }
  if ((m = line.match(reDayMonth))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const dt = withYear(mo, +m[1], m[3], termStart);
    if (valid(dt, mo, +m[1])) return { date: dt, raw: m[0] };
  }
  if ((m = line.match(reSlash))) {
    let a = +m[1], b = +m[2];
    // Canada mixes both orders: if the first number can't be a month, read it as day/month
    let mo = a - 1, d = b;
    if ((a > 12 && b <= 12) || (opts.dayFirst && b <= 12)) { mo = b - 1; d = a; }
    if (mo <= 11 && d <= 31) {
      const dt = withYear(mo, d, m[3], termStart);
      if (valid(dt, mo, d)) return { date: dt, raw: m[0] };
    }
  }
  if (termStart && (m = line.match(reWeek))) {
    const n = +m[1];
    if (n >= 1 && n <= 16) {
      const dowM = line.match(reDow);
      const monday = fromIso(termStart);
      const offset = dowM ? (DOWS[dowM[1].slice(0, 3).toLowerCase()] + 6) % 7 : 4; // no weekday given: Friday of that week
      return { date: addDays(monday, (n - 1) * 7 + offset), raw: m[0] + (dowM ? '' : ''), fromWeek: true };
    }
  }
  return null;
}

function findTime(line) {
  if (/\bnoon\b/i.test(line)) return '12:00';
  if (/\bmidnight\b/i.test(line)) return '23:59';
  const r = line.match(/\b(\d{1,2})(?::(\d{2}))?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*([ap])\.?m\b/i);
  if (r) { const h = +r[1] % 12 + (r[3].toLowerCase() === 'p' ? 12 : 0); return String(h).padStart(2, '0') + ':' + (r[2] || '00'); }
  const m = line.match(reTime);
  if (!m) return null;
  let h, min;
  if (m[3]) { h = +m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0); min = +(m[2] || 0); }
  else { h = +m[4]; min = +m[5]; }
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

function cleanTitle(line, raw) {
  let t = line
    .replace(raw, ' ')
    .replace(/^\s*[-–]\s*\d{1,2}\b/, ' ')
    .replace(/\s[-–]\s?\d{1,2}(?=\s|$)/, ' ')
    .replace(/\(\s*\d{1,3}(\.\d+)?\s*%\s*\)/g, ' ')
    .replace(reWeight, ' ')
    .replace(/\bweek\s*\d{1,2}\b/gi, ' ')
    .replace(/\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b\.?/gi, ' ')
    .replace(/@/g, ' ')
    .replace(/\b\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}(:\d{2})?\s*[ap]\.?m\.?/gi, ' ')
    .replace(/\b(before|after|at the start of|at the end of|start of|end of|during|in) (the )?(lecture|class|tutorial|lab)\b/gi, ' ')
    .replace(/\b\d{1,2}(:\d{2})?\s*[ap]\.?m\.?/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(due|on|by|in class|at|before|worth|weight|date|deadline|E[SD]?T|noon|midnight)\b/gi, ' ')
    .replace(/[|\t]+/g, ' ')
    .replace(/\s+[-–—:,;]+\s+/g, ' ')
    .replace(/^[\s\-–—:•*·\d.)]+(?=[A-Za-z])/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–—:,;.(]+$/, '')
    .replace(/^[\s\-–—:,;.)]+/, '')
    .trim();
  if (t.length > 80) t = t.slice(0, 77).trim() + '…';
  return t || 'Deadline';
}

// "Friday, January 23" when Jan 23 is a Saturday usually means last year's syllabus
function dowMismatch(line, f) {
  if (f.fromWeek) return false;
  const near = line.slice(Math.max(0, line.indexOf(f.raw) - 12), line.indexOf(f.raw));
  const m = near.match(reDow);
  return !!m && DOWS[m[1].slice(0, 3).toLowerCase()] !== f.date.getDay();
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function parseSyllabus(text, { courseId = null, termStart = null } = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const sl = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)];
  const opts = { dayFirst: sl.some((m) => +m[1] > 12) && !sl.some((m) => +m[2] > 12) };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.length > 240) continue;
    if (SKIP.test(line) && !TYPES.some((t) => t.re.test(line.replace(SKIPG, ' ')))) continue;
    if (POLICY.test(line)) continue;
    let f = findDate(line, termStart, opts);
    // "April 14 - 26 (date TBA)" is an exam-period window, not a date
    if (f && f.fromRange && /\b(TBA|TBD)\b/i.test(line)) f = null;
    if (!f) {
      // graded work with no date yet: keep it so the grade math adds up, and ask for the date later
      const tbaType = TYPES.find((t) => t.re.test(line));
      if (/\b(TBA|TBD|to be (announced|determined)|exam period|during exams?)\b/i.test(line) && (tbaType || reWeight.test(line))) {
        const w = line.match(reWeight);
        out.push({ id: uid(), courseId, title: cleanTitle(line.replace(/\b(TBA|TBD|to be (announced|determined)|(during (the )?)?(final )?exam period|during exams?)\b/gi, ' '), ''), type: (tbaType || TYPES[TYPES.length - 1]).k, weight: w ? +(+w[1]).toFixed(1) : null, due: null, time: null, guessed: false, tba: true });
      }
      continue;
    }
    let type = TYPES.find((t) => t.re.test(line));
    // a "Week 3: Chapter 2" row from a schedule table isn't a deadline unless it names work
    if (f.fromWeek && !type) continue;
    // date-only row (common in PDF tables): borrow the title from the line above
    let title = cleanTitle(line, f.raw);
    if ((title === 'Deadline' || /^\s*due\b/i.test(line)) && i > 0) {
      let j = i - 1; while (j > 0 && /^\s*\d{1,3}(\.\d+)?\s*%\s*$/.test(lines[j])) j--;
      const prev = lines[j].trim();
      if (prev && !findDate(prev, termStart, opts)) {
        line = lines.slice(j, i).map((x) => x.trim()).join(' ') + ' ' + line;
        type = TYPES.find((t) => t.re.test(line)) || type;
        title = cleanTitle(prev, '');
      }
    }
    // wrapped sentence: the work word is on the line above
    if (!type && i > 0 && lines[i - 1].trim() && !lines[i - 1].includes('|') && !/[.!?]\s*$/.test(lines[i - 1].trim()) && !findDate(lines[i - 1], termStart, opts) && TYPES.some((t) => t.re.test(lines[i - 1]))) {
      line = lines[i - 1].trim() + ' ' + line; type = TYPES.find((t) => t.re.test(line)); title = cleanTitle(lines[i - 1].trim(), '');
    }
    // time on the next line ("6:30 – 8:30 pm, location TBA")
    if (!findTime(line.replace(f.raw, ' ')) && lines[i + 1] && /^\s*\d{1,2}(:\d{2})?\s*([ap]\.?m|[-–])/i.test(lines[i + 1]) && !findDate(lines[i + 1], termStart, opts)) line += ' ' + lines[i + 1].trim();
    if (!type) {
      // a bare date with no work word is usually schedule noise ("Jan 12 Intro to the course")
      if (!/%/.test(line)) continue;
      type = TYPES[TYPES.length - 1];
    }
    const w = line.match(reWeight);
    if (f.all && f.all.length > 2 && f.all.every((a) => !a.end) && /,/.test(line)) {
      const tt = title.replace(/[,:;\s]+(?=[,:;\s]*$)/, '').split(/[:(]/)[0].trim() || title;
      f.all.forEach((a, n) => out.push({ id: uid(), courseId, title: tt + ' ' + (n + 1), type: type.k, weight: w ? Math.round(+w[1]) : null, due: iso(a.date), time: null, guessed: false }));
      continue;
    }
    out.push({
      id: uid(), courseId, title, type: type.k,
      weight: w ? +(+w[1]).toFixed(1) : null,
      due: iso(f.date), time: findTime(line.replace(f.raw, ' ')),
      guessed: !!(f.fromWeek || f.fromRange || dowMismatch(line, f)),
    });
  }
  // the same deadline often appears twice (grading table + schedule)
  const seen = new Set();
  return out
    .filter((x) => { const k = x.due + '|' + x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

// Steps are anchored to the day the deadline was planned, so they don't drift every day.
// Small items get fewer steps (a 3% lab doesn't need a 14-day plan).
// Step ids include the type and the recipe index, so changing the type never moves old ticks onto new steps.
export function stepCount(item) {
  const full = typeOf(item.type).plan.length;
  const w = item.weight;
  if (w == null) return full;
  if (w <= 3) return Math.min(full, 1);
  if (w <= 7) return Math.min(full, 2);
  if (w <= 12) return Math.min(full, 3);
  return full;
}
export function stepsFor(item, plannedFrom) {
  if (!item.due) return [];
  const type = typeOf(item.type);
  const due = fromIso(item.due);
  const start = fromIso(plannedFrom || item.plannedFrom || iso(new Date()));
  const keep = stepCount(item);
  const recipe = type.plan.map((p, i) => [...p, i]).slice(type.plan.length - keep);
  // first step keeps the title in it so it reads on its own
  if (recipe.length && !recipe[0][1].includes('{t}')) recipe[0] = [recipe[0][0], recipe[0][1].replace(/^./, (c) => c.toLowerCase()).replace(/^/, 'Start {t}: '), recipe[0][2]];
  const left = Math.round((due - start) / 864e5);
  const span = recipe.length ? -recipe[0][0] : 0;
  const squeeze = left >= 0 && span > left;
  const n = recipe.length;
  const steps = recipe.map(([off, txt, k], i) => {
    let d = addDays(due, off);
    if (squeeze) {
      d = addDays(start, Math.min(Math.max(left - 1, 0), Math.floor((i * Math.max(left, 1)) / n)));
      if (d < start) d = start;
    }
    const text = txt.includes('{t}') ? txt.replace('{t}', item.title) : txt;
    return { id: `${item.id}-${item.type}-${k}`, itemId: item.id, date: iso(d), text, kind: 'step', ctx: txt.includes('{t}') ? null : item.title };
  });
  steps.push({ id: item.id + '-due', itemId: item.id, date: item.due, time: item.time, text: item.title, kind: 'due' });
  return steps;
}

// Default term start: the Monday of the first full week of January if we're in Nov/Dec,
// else the Monday of the current week.
export function defaultTermStart(now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (d.getMonth() >= 10) {
    const jan = new Date(d.getFullYear() + 1, 0, 1);
    const off = (8 - jan.getDay()) % 7; // days until Monday
    return iso(addDays(jan, off === 0 ? 0 : off));
  }
  return iso(addDays(d, -((d.getDay() + 6) % 7)));
}
