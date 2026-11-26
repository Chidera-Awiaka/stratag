import { useEffect, useState } from 'react';
import { readIcs, toDeadlines } from './lib/ical.js';
import { iso, addDays, today, fromIso, fmt, fmtTime } from './lib/dates.js';

export async function fetchFeed(url) {
  const r = await fetch('/api/ical?url=' + encodeURIComponent(url.trim()));
  const body = await r.text();
  if (!r.ok) throw new Error(body || 'Could not load that calendar');
  return toDeadlines(readIcs(body));
}

const SCHOOLS = [
  ['UW · LEARN', 'learn.uwaterloo.ca'],
  ['Laurier · MyLearningSpace', 'mylearningspace.wlu.ca'],
  ['Conestoga · eConestoga', 'conestoga.desire2learn.com'],
];

// "Connect LEARN / D2L": paste the calendar subscription link once, and StratAG keeps pulling in
// whatever your profs post there.
export function LmsSheet({ courses, onClose, onImport }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState({});

  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);

  const load = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const from = iso(addDays(today(), -14));
      const r = (await fetchFeed(url)).filter((x) => x.due >= from).sort((a, b) => a.due.localeCompare(b.due));
      setRows(r); setPick(Object.fromEntries(r.map((x) => [x.extUid, x.looksLikeWork])));
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const groups = rows ? Object.entries(rows.reduce((g, x) => { (g[x.course || 'From your calendar'] ||= []).push(x); return g; }, {})) : [];
  const n = rows ? rows.filter((x) => pick[x.extUid]).length : 0;

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="lms-h">
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        {!rows ? (
          <form onSubmit={load} className="lms">
            <h2 id="lms-h">Connect LEARN / D2L</h2>
            <p className="lede">Every date your profs post on LEARN, MyLearningSpace or eConestoga lands in your plan, and stays updated when they change it.</p>
            <ol className="howto">
              <li>Open your school's site ({SCHOOLS.map(([l]) => l).join(', ')}) and go to <b>Calendar</b>.</li>
              <li>Pick <b>All courses</b>, then click <b>Subscribe</b> (the little icon near the top).</li>
              <li>Copy the link it shows and paste it here.</li>
            </ol>
            <label className="fl wide">Calendar link<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://learn.uwaterloo.ca/d2l/le/calendar/feed/user/feed.ics?token=…" /></label>
            <p className="note">This link is private to you, like a password for your calendar. We only use it to read your due dates.</p>
            {err && <p className="err">{err}</p>}
            <div className="row end"><button className="btn" disabled={busy || !url.trim()}>{busy ? 'Loading…' : 'Load my dates'}</button></div>
          </form>
        ) : (
          <>
            <h2 id="lms-h">{rows.length ? `Found ${rows.length} dates` : 'Nothing coming up'}</h2>
            <p className="lede">{rows.length ? 'We ticked the ones that look like work. Untick anything that isn\'t.' : 'That calendar has no upcoming events. Your profs may not have posted dates yet, so try again closer to the term.'}</p>
            <div className="lms-list">
              {groups.map(([course, list]) => (
                <div key={course}>
                  <h3>{course}{courses.some((c) => c.name.toUpperCase() === course.toUpperCase()) && <small> · adds to your existing course</small>}</h3>
                  {list.map((x) => (
                    <label key={x.extUid} className="pickrow">
                      <input type="checkbox" checked={!!pick[x.extUid]} onChange={(e) => setPick({ ...pick, [x.extUid]: e.target.checked })} />
                      <span className="when">{fmt(fromIso(x.due), { weekday: 'short', month: 'short', day: 'numeric' })}{x.time ? ' · ' + fmtTime(x.time) : ''}</span>
                      <span>{x.title}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="row end">
              <button className="link" onClick={() => setRows(null)}>Back</button>
              <button className="btn" disabled={!n} onClick={() => onImport(url.trim(), rows.filter((x) => pick[x.extUid]))}>Add {n} to my plan</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Merge feed rows into the plan. Existing items (matched by the feed's event id) follow date changes
// unless the student edited them; new ones are added when `addNew` lets them in.
export function applyFeed(s, url, rows, { addNew, nextInk, uid }) {
  const now = Date.now();
  let courses = [...s.courses];
  const items = [...s.items];
  let added = 0, moved = 0;
  for (const r of rows) {
    const ex = items.findIndex((i) => i.extUid === r.extUid && !i.deleted);
    if (ex >= 0) {
      const it = items[ex];
      if (!it.edited && (it.due !== r.due || (it.time || null) !== (r.time || null))) { items[ex] = { ...it, due: r.due, time: r.time, t: now }; moved++; }
      continue;
    }
    if (items.some((i) => i.extUid === r.extUid)) continue; // deleted by the student: stay deleted
    if (!addNew(r)) continue;
    const name = r.course || 'LEARN';
    let c = courses.find((x) => !x.deleted && !x.sample && x.name.toUpperCase() === name.toUpperCase());
    if (!c) { c = { id: uid(), name, color: nextInk(courses.filter((x) => !x.deleted && !x.sample).map((x) => x.color)), feedUrl: url, t: now }; courses.push(c); }
    else if (!c.feedUrl) { courses = courses.map((x) => (x.id === c.id ? { ...x, feedUrl: url, t: now } : x)); }
    // de-dupe against something typed in from the syllabus: same course, same day, similar title
    const twin = items.find((i) => !i.deleted && i.courseId === c.id && i.due === r.due && !i.extUid && simil(i.title, r.title));
    if (twin) { items[items.indexOf(twin)] = { ...twin, extUid: r.extUid, time: twin.time || r.time, t: now }; continue; }
    items.push({ id: uid(), courseId: c.id, title: r.title, type: r.type, weight: r.weight, due: r.due, time: r.time, extUid: r.extUid, plannedFrom: iso(today()), t: now });
    added++;
  }
  // the sample steps aside once real dates arrive
  if (added) courses = courses.map((x) => (x.sample && !x.deleted ? { ...x, deleted: true, t: now } : x));
  return { state: { ...s, courses, items, feeds: { ...(s.feeds || {}), [url]: { v: true, t: now } } }, added, moved };
}
const words = (t) => new Set(t.toLowerCase().match(/[a-z]+|\d+/g) || []);
function simil(a, b) { const A = words(a), B = words(b); let n = 0; A.forEach((w) => B.has(w) && n++); return n >= Math.min(2, A.size, B.size); }
