import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSyllabus, stepsFor, defaultTermStart, TYPES, typeOf } from './lib/parse.js';
import { iso, fromIso, addDays, today, daysBetween, mondayOf, fmt, fmtTime } from './lib/dates.js';
import { buildIcs } from './lib/ics.js';
import { loadLocal, saveLocal, merge, pull, push, supabase } from './lib/store.js';
import { sampleSyllabus } from './sample.js';
import { APP_NAME, MAKER, TAGLINE } from './config.js';

const INKS = ['#FF6B1F', '#2F4A7A', '#5C7A3A', '#7A3B69', '#B9801A', '#2B7A78'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

export default function App() {
  const [state, setState] = useState(loadLocal);
  const [view, setView] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheet, setSheet] = useState(null); // null | {courseId?}
  const [filter, setFilter] = useState(null);
  const [session, setSession] = useState(null);
  const [sync, setSync] = useState('local'); // local | syncing | synced | error
  const [toast, setToast] = useState(null);
  const pushTimer = useRef();
  const pulled = useRef(false);

  const say = (m) => { setToast(m); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2600); };

  const courses = state.courses.filter((c) => !c.deleted);
  const items = state.items.filter((i) => !i.deleted && courses.some((c) => c.id === i.courseId));
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [state.courses]);
  const steps = useMemo(() => items.filter((i) => !filter || i.courseId === filter).flatMap((i) => stepsFor(i)), [state, filter]);
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [state.items]);
  const isDone = (id) => !!state.done[id]?.v;

  // ---- persistence + sync ----
  useEffect(() => {
    saveLocal(state);
    if (!session || !pulled.current) return;
    clearTimeout(pushTimer.current);
    setSync('syncing');
    pushTimer.current = setTimeout(() => push(session.user.id, state).then(() => setSync('synced'), () => setSync('error')), 1200);
  }, [state, session]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { pulled.current = false; setSync('local'); return; }
    const doPull = () => pull(session.user.id).then((remote) => {
      pulled.current = true;
      setState((s) => merge(s, remote));
      setSync('synced');
    }, () => setSync('error'));
    doPull();
    const onVis = () => document.visibilityState === 'visible' && doPull();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session?.user?.id]);

  // ---- mutations ----
  const toggle = (id) => setState((s) => ({ ...s, done: { ...s.done, [id]: { v: !s.done[id]?.v, t: now() } } }));
  const upsertItem = (it) => setState((s) => ({ ...s, items: [...s.items.filter((x) => x.id !== it.id), { ...it, t: now() }] }));
  const removeItem = (id) => setState((s) => ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, deleted: true, t: now() } : x)) }));
  const removeCourse = (id) => {
    if (!confirmDelete()) return;
    setState((s) => ({ ...s, courses: s.courses.map((c) => (c.id === id ? { ...c, deleted: true, t: now() } : c)) }));
    if (filter === id) setFilter(null);
  };
  const confirmDelete = () => window.confirm('Remove this course and all its deadlines?');

  const addPlan = ({ course, newItems, termStart }) => {
    const planned = iso(today());
    setState((s) => {
      const existing = s.courses.find((c) => c.id === course.id);
      return {
        ...s,
        termStart, termStartT: now(),
        courses: existing ? s.courses.map((c) => (c.id === course.id ? { ...course, t: now() } : c)) : [...s.courses, { ...course, t: now() }],
        items: [...s.items, ...newItems.map((i) => ({ ...i, courseId: course.id, plannedFrom: planned, t: now() }))],
      };
    });
    setSheet(null); setView('week'); setWeekOffset(0);
    say(`${newItems.length} deadline${newItems.length === 1 ? '' : 's'} planned for ${course.name}`);
  };

  const exportIcs = () => {
    const txt = buildIcs(steps, (s) => courseById[itemById[s.itemId]?.courseId]?.name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' }));
    a.download = 'study-plan.ics'; a.click();
    say('Saved study-plan.ics. Open it to add to your calendar.');
  };

  const nextDue = items.filter((i) => i.due >= iso(today())).sort((a, b) => a.due.localeCompare(b.due))[0];
  const stepDone = steps.filter((s) => isDone(s.id)).length;
  const empty = courses.length === 0;

  return (
    <div className="shell">
      <aside className="spine">
        <a className="brand" href="/" aria-label={APP_NAME + ' home'}>
          <img className="mark" src="/icon.svg" alt="" width="40" height="40" />
          <span className="name"><span>{APP_NAME.split(/(A)/).map((p, i) => (p === "A" ? <em key={i}>A</em> : p))}</span><small>{TAGLINE} · by {MAKER}</small></span>
        </a>
        <nav className="tabs" aria-label="Courses">
          <button className={'tab' + (!filter ? ' on' : '')} onClick={() => setFilter(null)}>All courses</button>
          {courses.map((c) => (
            <button key={c.id} className={'tab' + (filter === c.id ? ' on' : '')} style={{ '--ink': c.color }} onClick={() => setFilter(filter === c.id ? null : c.id)}>
              <span className="dot" />{c.name}
            </button>
          ))}
          <button className="tab add" onClick={() => setSheet({})}>+ Add a syllabus</button>
        </nav>
        {!empty && (
          <div className="spine-foot">
            <button className="link" onClick={exportIcs}>Export to calendar (.ics)</button>
            <Account session={session} sync={sync} say={say} />
          </div>
        )}
      </aside>

      <main className="page">
        {empty ? (
          <Welcome onStart={() => setSheet({})} onSample={() => setSheet({ sample: true })} />
        ) : (
          <>
            <header className="masthead">
              <div className="next">
                {nextDue ? (
                  <>
                    <span className="kicker">Next up</span>
                    <span className="count">{daysBetween(today(), fromIso(nextDue.due)) || 'today'}</span>
                    <span className="unit">{daysBetween(today(), fromIso(nextDue.due)) === 0 ? '' : daysBetween(today(), fromIso(nextDue.due)) === 1 ? 'day' : 'days'}</span>
                    <span className="what"><Ink c={courseById[nextDue.courseId]} /> {nextDue.title}{nextDue.weight ? <em> · {nextDue.weight}%</em> : null}</span>
                  </>
                ) : <span className="kicker">Nothing due. Enjoy it.</span>}
              </div>
              <div className="tally" aria-label="Progress">
                <Meter v={steps.length ? stepDone / steps.length : 0} />
                <span><b>{stepDone}</b> of {steps.length} steps done</span>
              </div>
            </header>

            <div className="switch" role="tablist">
              <button role="tab" aria-selected={view === 'week'} onClick={() => setView('week')}>Week</button>
              <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>Deadlines</button>
            </div>

            {view === 'week' ? (
              <Week steps={steps} offset={weekOffset} setOffset={setWeekOffset} isDone={isDone} toggle={toggle} itemById={itemById} courseById={courseById} />
            ) : (
              <Deadlines items={items.filter((i) => !filter || i.courseId === filter)} courses={courses.filter((c) => !filter || c.id === filter)} upsert={upsertItem} remove={removeItem} removeCourse={removeCourse} addTo={(id) => setSheet({ courseId: id })} />
            )}
          </>
        )}
      </main>

      {sheet && (
        <ImportSheet
          init={sheet}
          course={courses.find((c) => c.id === sheet.courseId)}
          usedInks={courses.map((c) => c.color)}
          termStart={state.termStart || defaultTermStart()}
          onClose={() => setSheet(null)}
          onDone={addPlan}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Welcome({ onStart, onSample }) {
  return (
    <section className="welcome">
      <p className="kicker">For the January term · free</p>
      <h1>Your syllabus already knows <span className="hl">every deadline.</span> Let it plan your weeks.</h1>
      <p className="lede">Drop in the PDF or paste the text. Each assignment, quiz and exam gets broken into small dated steps, so the midterm stops being a surprise. Send it all to Google, Apple or Outlook calendar.</p>
      <div className="row">
        <button className="btn" onClick={onStart}>Add my first syllabus</button>
        <button className="btn ghost" onClick={onSample}>Try it with a sample</button>
      </div>
      <ol className="how">
        <li><b>1</b> Drop a syllabus</li>
        <li><b>2</b> Fix anything we misread</li>
        <li><b>3</b> Tick off one small step a day</li>
      </ol>
    </section>
  );
}

function Week({ steps, offset, setOffset, isDone, toggle, itemById, courseById }) {
  const t = today();
  const start = addDays(mondayOf(t), offset * 7);
  const tIso = iso(t);
  const overdue = offset === 0 ? steps.filter((s) => s.date < iso(start) && !isDone(s.id) && s.date >= iso(addDays(start, -14))) : [];
  return (
    <section className="week">
      <div className="week-head">
        <button className="arrow" onClick={() => setOffset(offset - 1)} aria-label="Previous week">‹</button>
        <h2>{fmt(start)} <span>to</span> {fmt(addDays(start, 6))}</h2>
        <button className="arrow" onClick={() => setOffset(offset + 1)} aria-label="Next week">›</button>
        {offset !== 0 && <button className="link" onClick={() => setOffset(0)}>Back to this week</button>}
      </div>
      {overdue.length > 0 && (
        <div className="catchup">
          <h3>Catch up <span>{overdue.length} from last week{overdue.length > 1 ? 's' : ''}</span></h3>
          {overdue.map((s) => <Step key={s.id} s={s} done={isDone(s.id)} toggle={toggle} item={itemById[s.itemId]} course={courseById[itemById[s.itemId]?.courseId]} late />)}
        </div>
      )}
      <ol className="days">
        {DOW.map((d, i) => {
          const day = addDays(start, i);
          const k = iso(day);
          const list = steps.filter((s) => s.date === k).sort((a, b) => (a.kind === 'due') - (b.kind === 'due'));
          return (
            <li key={k} className={'day' + (k === tIso ? ' today' : '') + (k < tIso ? ' past' : '') + (list.length ? '' : ' free')}>
              <div className="date">
                <span className="dow">{d}</span>
                <span className="num">{day.getDate()}{k === tIso && <Circle />}</span>
              </div>
              <div className="lines">
                {list.length === 0 ? <span className="nothing">{i >= 5 ? 'weekend' : 'free'}</span> :
                  list.map((s) => <Step key={s.id} s={s} done={isDone(s.id)} toggle={toggle} item={itemById[s.itemId]} course={courseById[itemById[s.itemId]?.courseId]} late={k < tIso} />)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Step({ s, done, toggle, item, course, late }) {
  return (
    <label className={'step' + (s.kind === 'due' ? ' due' : '') + (done ? ' done' : '') + (late && !done ? ' late' : '')} style={{ '--ink': course?.color }}>
      <input type="checkbox" checked={done} onChange={() => toggle(s.id)} />
      <span className="box" aria-hidden="true"><Tick /></span>
      <span className="txt">
        {s.kind === 'due' && <strong className="stamp">Due{s.time ? ' ' + fmtTime(s.time) : ''}</strong>}
        {s.text}
        {s.ctx && <span className="ctx"> · {s.ctx}</span>}
        <span className="course">{course?.name}{s.kind === 'due' && item?.weight ? ` · ${item.weight}%` : ''}</span>
      </span>
    </label>
  );
}

function Deadlines({ items, courses, upsert, remove, removeCourse, addTo }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="ledger">
      {courses.map((c) => {
        const list = items.filter((i) => i.courseId === c.id).sort((a, b) => a.due.localeCompare(b.due));
        const total = list.reduce((n, i) => n + (i.weight || 0), 0);
        return (
          <div key={c.id} className="course-block" style={{ '--ink': c.color }}>
            <div className="course-head">
              <h2>{c.name}</h2>
              <span className="meta">{list.length} deadlines{total ? ` · ${total}% of your grade` : ''}</span>
              <button className="link" onClick={() => setEditing({ id: uid(), courseId: c.id, title: '', type: 'asg', due: iso(addDays(today(), 7)), weight: null, plannedFrom: iso(today()), isNew: true })}>+ Add one</button>
              <button className="link" onClick={() => addTo(c.id)}>Add more from text</button>
              <button className="link danger" onClick={() => removeCourse(c.id)}>Remove course</button>
            </div>
            <Grades list={list} upsert={upsert} />
            <ul>
              {editing?.isNew && editing.courseId === c.id && <EditRow it={editing} save={(x) => { const { isNew, ...rest } = x; upsert(rest); setEditing(null); }} cancel={() => setEditing(null)} />}
              {list.map((i) => editing?.id === i.id ? (
                <EditRow key={i.id} it={editing} save={(x) => { upsert(x); setEditing(null); }} cancel={() => setEditing(null)} remove={() => { remove(i.id); setEditing(null); }} />
              ) : (
                <li key={i.id} className={'dl' + (i.due < iso(today()) ? ' gone' : '')}>
                  <span className="when">{fmt(fromIso(i.due), { weekday: 'short', month: 'short', day: 'numeric' })}{i.time ? ' · ' + fmtTime(i.time) : ''}</span>
                  <span className="what">{i.title}{i.guessed && <em title="Worked out from a week number. Double check it."> · check date</em>}</span>
                  <span className="kind">{typeOf(i.type).label}{i.weight ? ` · ${i.weight}%` : ''}</span>
                  <button className="link" onClick={() => setEditing({ ...i })}>Edit</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function EditRow({ it, save, cancel, remove }) {
  const [x, setX] = useState(it);
  const f = (k) => (e) => setX({ ...x, [k]: e.target.value });
  return (
    <li className="dl editing">
      <input aria-label="Title" value={x.title} placeholder="e.g. Lab 3" onChange={f('title')} autoFocus />
      <input aria-label="Due date" type="date" value={x.due} onChange={f('due')} />
      <input aria-label="Time" type="time" value={x.time || ''} onChange={f('time')} />
      <select aria-label="Type" value={x.type} onChange={f('type')}>{TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select>
      <input aria-label="Weight %" type="number" min="0" max="100" placeholder="%" value={x.weight ?? ''} onChange={(e) => setX({ ...x, weight: e.target.value === '' ? null : +e.target.value })} />
      <span className="row">
        <button className="btn small" disabled={!x.title.trim() || !x.due} onClick={() => save({ ...x, title: x.title.trim(), guessed: false })}>Save</button>
        <button className="link" onClick={cancel}>Cancel</button>
        {remove && <button className="link danger" onClick={remove}>Delete</button>}
      </span>
    </li>
  );
}

function ImportSheet({ init, course, usedInks, termStart: ts0, onClose, onDone }) {
  const [name, setName] = useState(course?.name || (init.sample ? 'PSYC 201' : ''));
  const [color] = useState(course?.color || INKS.find((c) => !usedInks.includes(c)) || INKS[usedInks.length % INKS.length]);
  const [termStart, setTermStart] = useState(ts0);
  const [text, setText] = useState(init.sample ? sampleSyllabus() : '');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);

  const readFile = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        const { pdfToText } = await import('./lib/pdf.js');
        const t = await pdfToText(file);
        if (t.trim().length < 40) throw new Error('scanned');
        setText(t);
      } else setText(await file.text());
      if (!name) setName(guessCourse(file.name));
    } catch (e) {
      setErr(e.message === 'scanned' ? "That PDF looks like a scan (a picture of text), so there's nothing to read. Copy the deadlines in by hand, or try the course's web version." : "Couldn't read that file. Try copying the text and pasting it instead.");
    }
    setBusy(false);
  };

  const run = () => {
    const r = parseSyllabus(text, { termStart });
    setFound(r);
    if (!name.trim()) setName(guessCourse(text) || 'My course');
  };

  const edit = (id, k, v) => setFound(found.map((i) => (i.id === id ? { ...i, [k]: v, guessed: k === 'due' ? false : i.guessed } : i)));

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" style={{ '--ink': color }}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        {!found ? (
          <>
            <h2 id="sheet-h">{course ? `More for ${course.name}` : 'Add a syllabus'}</h2>
            <div className="fields">
              <label>Course<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PSYC 101" /></label>
              <label>Monday of week 1<input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /><small>Used for "Week 5" style dates</small></label>
            </div>
            <div className={'drop' + (drag ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste the syllabus here, or drop the PDF on this box.\n\nThe grading table and schedule are the parts that matter.'} />
              <div className="drop-bar">
                <label className="btn ghost small file">{busy ? 'Reading…' : 'Choose a PDF'}<input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => readFile(e.target.files[0])} hidden /></label>
                <span className="note">Your file stays on your device.</span>
              </div>
            </div>
            {err && <p className="err">{err}</p>}
            <div className="row end">
              <button className="btn" disabled={!text.trim() || busy} onClick={run}>Find the deadlines</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="sheet-h">{found.length ? `Found ${found.length}. Look right?` : 'No deadlines found'}</h2>
            {found.length === 0 ? (
              <p className="lede">We look for lines with a date and a word like quiz, exam, essay, lab or assignment. Try pasting just the grading table or schedule, or add them by hand after.</p>
            ) : (
              <p className="lede">Fix anything we misread. Rows marked <em>check date</em> came from a week number.</p>
            )}
            <ul className="review">
              {found.map((i) => (
                <li key={i.id}>
                  <input aria-label="Title" value={i.title} onChange={(e) => edit(i.id, 'title', e.target.value)} />
                  <input aria-label="Due date" type="date" value={i.due} onChange={(e) => edit(i.id, 'due', e.target.value)} className={i.guessed ? 'guess' : ''} />
                  <select aria-label="Type" value={i.type} onChange={(e) => edit(i.id, 'type', e.target.value)}>{TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select>
                  <span className="w">{i.weight ? i.weight + '%' : ''}</span>
                  <button className="link danger" onClick={() => setFound(found.filter((x) => x.id !== i.id))} aria-label={'Remove ' + i.title}>×</button>
                </li>
              ))}
            </ul>
            <div className="row end">
              <button className="link" onClick={() => setFound(null)}>Back to the text</button>
              <button className="btn" disabled={!found.length || !name.trim()} onClick={() => onDone({ course: { id: course?.id || uid(), name: name.trim(), color }, newItems: found, termStart })}>Plan it</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function guessCourse(s) {
  const m = (s || '').match(/\b([A-Z]{2,5})[\s-]?(\d{3,4}[A-Z]?)\b/);
  return m ? `${m[1]} ${m[2]}` : '';
}

function Account({ session, sync, say }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (!supabase) return <p className="saved">Saved on this device</p>;
  if (session) {
    return (
      <div className="acct">
        <p className="saved">{{ synced: 'Synced', syncing: 'Syncing…', error: "Couldn't sync, will retry", local: 'Saved' }[sync]} · {session.user.email}</p>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  const send = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) say(error.message); else setSent(true);
  };
  return (
    <div className="acct">
      <p className="saved">Saved on this device only</p>
      {!open ? <button className="link" onClick={() => setOpen(true)}>Sync to your phone</button> : sent ? (
        <p className="saved">Check {email} for a sign-in link.</p>
      ) : (
        <form onSubmit={send} className="mini">
          <input type="email" required placeholder="you@school.ca" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button className="btn small">Email me a link</button>
        </form>
      )}
    </div>
  );
}

// ---- hand-drawn bits ----
const Loop = () => (
  <svg viewBox="0 0 64 32" className="loop" aria-hidden="true">
    <path d="M32 16c-6-8-12-12-18-12C7 4 3 9 3 16s4 12 11 12c6 0 12-4 18-12 6-8 12-12 18-12 7 0 11 5 11 12s-4 12-11 12c-6 0-12-4-18-12z" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
);
const Circle = () => (
  <svg viewBox="0 0 60 50" className="circle" aria-hidden="true">
    <path d="M38 6C22 1 5 9 4 24c-1 14 14 22 30 21 14-1 23-10 22-21C55 12 44 4 30 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
const Tick = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 11c2 1 4 3 5 5 3-6 6-10 10-13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Ink = ({ c }) => <span className="ink" style={{ background: c?.color }} />;
const Meter = ({ v }) => (
  <svg viewBox="0 0 40 40" className="meter" aria-hidden="true">
    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--rule)" strokeWidth="5" />
    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ember)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${v * 100.5} 200`} transform="rotate(-90 20 20)" />
  </svg>
);

const TARGETS = [['A+', 90], ['A', 80], ['B', 70], ['C', 60], ['Pass', 50]];
function Grades({ list, upsert }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(80);
  const weighted = list.filter((i) => i.weight);
  if (!weighted.length) return null;
  const graded = weighted.filter((i) => i.score != null);
  const gw = graded.reduce((n, i) => n + i.weight, 0);
  const earned = graded.reduce((n, i) => n + (i.weight * i.score) / 100, 0);
  const total = weighted.reduce((n, i) => n + i.weight, 0);
  const left = total - gw;
  const need = left > 0 ? ((target / 100) * total - earned) / left * 100 : null;
  const worst = graded.filter((i) => i.score < target).sort((a, b) => (b.weight * (target - b.score)) - (a.weight * (target - a.score)))[0];
  return (
    <div className="grades">
      <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide marks' : graded.length ? `Your mark so far: ${(earned / gw * 100).toFixed(1)}%` : 'Add your marks'}</button>
      {open && (
        <>
          <ul className="marks">
            {weighted.map((i) => (
              <li key={i.id}>
                <span>{i.title} <em>{i.weight}%</em></span>
                <input type="number" min="0" max="110" step="0.5" placeholder="mark %" aria-label={'Mark for ' + i.title}
                  value={i.score ?? ''} onChange={(e) => upsert({ ...i, score: e.target.value === '' ? null : +e.target.value })} />
              </li>
            ))}
          </ul>
          <div className="verdict">
            <label>Aiming for <select value={target} onChange={(e) => setTarget(+e.target.value)}>{TARGETS.map(([l, v]) => <option key={v} value={v}>{l} ({v}%)</option>)}</select></label>
            {graded.length === 0 ? <p>Enter a mark when you get one back and this tells you what you need on everything left.</p> :
              left <= 0 ? <p>All graded. You finished with <b>{(earned / total * 100).toFixed(1)}%</b>.</p> :
              need > 100 ? <p>You'd need <b>{need.toFixed(0)}%</b> on the remaining {left}%, which is out of reach. Talk to your prof about bonus marks or a remark.</p> :
              need <= 0 ? <p>You've already locked it in. Anything on the last {left}% is a bonus.</p> :
              <p>You need an average of <b>{need.toFixed(0)}%</b> on the remaining {left}% of the course.</p>}
            {worst && left > 0 && <p className="tip">Biggest gap: <b>{worst.title}</b> ({worst.score}% on a {worst.weight}% item). Look at what went wrong there before the next one like it.</p>}
          </div>
        </>
      )}
    </div>
  );
}
