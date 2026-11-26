import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSyllabus, stepsFor, defaultTermStart, TYPES, typeOf } from './lib/parse.js';
import { iso, fromIso, addDays, today, daysBetween, mondayOf, fmt, fmtTime } from './lib/dates.js';
import { buildIcs } from './lib/ics.js';
import { loadLocal, saveLocal, merge, pull, push, supabase } from './lib/store.js';
import { sampleSyllabus } from './sample.js';
import { APP_NAME, MAKER, TAGLINE, MAKER_URL } from './config.js';
import { LmsSheet, applyFeed, fetchFeed } from './Lms.jsx';
import { Feedback } from './Feedback.jsx';

// Course inks are stored as hex (synced data); on screen each maps to a CSS variable
// so dark mode can swap in lighter, readable versions.
const INKS = ['#FF6B1F', '#2F4A7A', '#5C7A3A', '#7A3B69', '#B9801A', '#2B7A78'];
const ink = (hex) => { const i = INKS.indexOf(hex); return i < 0 ? hex : `var(--c${i})`; };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
const nextInk = (used) => INKS.find((c) => !used.includes(c)) || INKS[used.length % INKS.length];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function App() {
  const [state, setState] = useState(loadLocal);
  const [view, setView] = useState('today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheet, setSheet] = useState(null); // null | {courseId?}
  const [filter, setFilter] = useState(null);
  const [session, setSession] = useState(null);
  const [sync, setSync] = useState('local'); // local | syncing | synced | error
  const [toast, setToast] = useState(null); // {msg, undo?}
  const [lms, setLms] = useState(false);
  const [fb, setFb] = useState(false);
  const pushTimer = useRef();
  const pulled = useRef(false);

  const say = (msg, undo) => { setToast({ msg, undo }); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), undo ? 7000 : 3000); };

  const courses = state.courses.filter((c) => !c.deleted);
  const items = state.items.filter((i) => !i.deleted && courses.some((c) => c.id === i.courseId));
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [state.courses]);
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [state.items, state.courses]);
  const visItems = items.filter((i) => !filter || i.courseId === filter);
  const steps = useMemo(() => visItems.flatMap((i) => stepsFor(i)).map((s) => {
    const m = state.moves?.[s.id];
    return m?.date ? { ...s, date: m.date, moved: true } : s;
  }), [state, filter]);
  const isDone = (id) => !!state.done[id]?.v;
  const t0 = iso(today());

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
  const toggle = (id) => setState((s) => {
    const v = !s.done[id]?.v;
    const next = { ...s, done: { ...s.done, [id]: { v, t: now() } } };
    if (v) {
      const itemId = id.endsWith('-due') ? id.slice(0, -4) : null;
      const it = itemId && s.items.find((x) => x.id === itemId);
      if (it) setTimeout(() => say(`${it.title} handed in. Nice.`), 0);
    }
    return next;
  });
  const skip = (id) => setState((s) => ({ ...s, done: { ...s.done, [id]: { v: true, skip: true, t: now() } } }));
  const moveTo = (id, date) => setState((s) => ({ ...s, moves: { ...(s.moves || {}), [id]: { date, t: now() } } }));
  const upsertItem = (it) => setState((s) => ({ ...s, items: [...s.items.filter((x) => x.id !== it.id), { ...it, t: now() }] }));
  const setDeleted = (key, id, deleted) => setState((s) => ({ ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, deleted, t: now() } : x)) }));
  const removeItem = (id) => {
    const it = itemById[id];
    setDeleted('items', id, true);
    say(`Deleted ${it?.title || 'deadline'}`, () => setDeleted('items', id, false));
  };
  const removeCourse = (id) => {
    const c = courseById[id];
    setDeleted('courses', id, true);
    if (filter === id) setFilter(null);
    say(`Removed ${c?.name || 'course'}`, () => setDeleted('courses', id, false));
  };

  const addPlan = ({ course, newItems, termStart }) => {
    const planned = t0;
    setState((s) => {
      const existing = s.courses.find((c) => c.id === course.id);
      // the sample steps aside as soon as a real course arrives
      const cs = course.sample ? s.courses : s.courses.map((c) => (c.sample && !c.deleted ? { ...c, deleted: true, t: now() } : c));
      return {
        ...s,
        termStart: course.sample ? s.termStart : termStart, termStartT: course.sample ? s.termStartT : now(),
        courses: existing ? cs.map((c) => (c.id === course.id ? { ...c, ...course, t: now() } : c)) : [...cs, { ...course, t: now() }],
        items: [...s.items, ...newItems.map((i) => ({ ...i, courseId: course.id, plannedFrom: planned, t: now() }))],
      };
    });
    setSheet(null); setFilter(null); setView('today'); setWeekOffset(0);
    if (!course.sample) say(`${plural(newItems.length, 'deadline')} planned for ${course.name}`);
  };

  const importFeed = (url, rows) => {
    let res;
    setState((s) => { res = applyFeed(s, url, rows, { addNew: () => true, nextInk, uid }); return res.state; });
    setLms(false); setFilter(null); setView('today'); setWeekOffset(0);
    setTimeout(() => res && say(`${plural(res.added, 'date')} added from your calendar. We'll keep it updated.`), 0);
  };
  // re-read connected LEARN / D2L feeds at most every 6 hours
  useEffect(() => {
    const feeds = Object.entries(state.feeds || {}).filter(([, f]) => f.v && now() - (f.t || 0) > 6 * 3600e3).map(([u]) => u);
    feeds.forEach((u) => fetchFeed(u).then((rows) => {
      let res;
      setState((s) => { res = applyFeed(s, u, rows.filter((r) => r.due >= iso(addDays(today(), -14))), { addNew: (r) => r.looksLikeWork, nextInk, uid }); return res.state; });
      setTimeout(() => res && (res.added || res.moved) && say(`Calendar update: ${res.added ? plural(res.added, 'new date') : ''}${res.added && res.moved ? ', ' : ''}${res.moved ? plural(res.moved, 'date') + ' changed' : ''}.`), 0);
    }, () => {}));
  }, [session?.user?.id]);

  const trySample = () => {
    const newItems = parseSyllabus(sampleSyllabus(), {});
    addPlan({ course: { id: uid(), name: 'PSYC 201', color: INKS[0], sample: true }, newItems });
  };

  const exportIcs = () => {
    const txt = buildIcs(steps.filter((s) => !state.done[s.id]?.skip), (s) => courseById[itemById[s.itemId]?.courseId]?.name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' }));
    a.download = (filter ? courseById[filter]?.name.replace(/\W+/g, '-') : 'study-plan') + '.ics'; a.click();
    say('Saved. Open the file to add it to your calendar.');
  };

  // next real deadline: not handed in, not TBA, in the current filter
  const nextDue = visItems.filter((i) => i.due && i.due >= t0 && !isDone(i.id + '-due')).sort(byDue)[0];
  const daysToNext = nextDue ? daysBetween(today(), fromIso(nextDue.due)) : null;
  const stepDone = steps.filter((s) => isDone(s.id)).length;
  const empty = courses.length === 0;
  const weekStart = iso(mondayOf(today())), weekEnd = iso(addDays(mondayOf(today()), 6));
  const thisWeek = steps.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const firstStep = steps.filter((s) => !isDone(s.id)).map((s) => s.date).sort()[0];
  const jumpToWeekOf = (d) => { setWeekOffset(Math.round(daysBetween(mondayOf(today()), mondayOf(fromIso(d))) / 7)); setView('week'); };
  const sampleCourse = courses.find((c) => c.sample);

  const views = [['today', 'Today'], ['week', 'Week'], ['list', 'Deadlines']];

  return (
    <div className={'shell' + (empty ? ' is-empty' : '')}>
      <aside className="spine">
        <a className="brand" href="/" aria-label={APP_NAME + ' home'}>
          <img className="mark" src="/icon.svg" alt="" width="40" height="40" />
          <span className="name"><span>{APP_NAME.split(/(A)/).map((p, i) => (p === 'A' ? <em key={i}>A</em> : p))}</span><small>{TAGLINE}</small></span>
        </a>
        <nav className="tabs" aria-label="Courses">
          <button className={'tab' + (!filter ? ' on' : '')} onClick={() => setFilter(null)}>All courses</button>
          {courses.map((c) => (
            <button key={c.id} className={'tab' + (filter === c.id ? ' on' : '')} style={{ '--ink': ink(c.color) }} onClick={() => setFilter(filter === c.id ? null : c.id)}>
              <span className="dot" />{c.name}{c.sample && <small className="tag">sample</small>}
            </button>
          ))}
          <button className="tab add" onClick={() => setSheet({})}>+ Add a syllabus</button>
          <button className="tab add lms-tab" onClick={() => setLms(true)}>{Object.keys(state.feeds || {}).length ? '↻ LEARN / D2L connected' : '+ Connect LEARN / D2L'}</button>
        </nav>
        {!empty && (
          <div className="glance" aria-label="This week">
            <span className="kicker">This week</span>
            <p><b>{thisWeek.filter((s) => s.kind === 'step' && !isDone(s.id)).length}</b> {thisWeek.filter((s) => s.kind === 'step' && !isDone(s.id)).length === 1 ? 'step' : 'steps'} left · <b>{thisWeek.filter((s) => s.kind === 'due').length}</b> due</p>
          </div>
        )}
        <div className="spine-foot">
          {!empty && <button className="link" onClick={exportIcs}>Export {filter ? courseById[filter]?.name : 'all courses'} to calendar</button>}
          <Account session={session} sync={sync} say={say} label={empty ? 'Already use StratAG? Sign in' : 'Sync to your phone'} />
          <button className="link" onClick={() => setFb(true)}>Send feedback</button>
          <a className="link" href="/privacy.html">Privacy</a>
        </div>
      </aside>

      <main className="page">
        {empty ? (
          <Welcome onStart={() => setSheet({})} onSample={trySample} onLms={() => setLms(true)} />
        ) : (
          <>
            {sampleCourse && (
              <div className="ribbon">
                <span><b>This is a sample course.</b> Drop in your real syllabus and it disappears.</span>
                <span className="row">
                  <button className="btn small" onClick={() => setSheet({})}>Add my syllabus</button>
                  <button className="link" onClick={() => removeCourse(sampleCourse.id)}>Remove sample</button>
                </span>
              </div>
            )}
            <header className="masthead">
              <div className="next">
                {nextDue ? (
                  <>
                    <span className="kicker">Next due{filter ? ' · ' + courseById[filter]?.name : ''}</span>
                    <span className="count">{daysToNext || 'Today'}</span>
                    <span className="unit">{daysToNext === 0 ? '' : daysToNext === 1 ? 'day' : 'days'}</span>
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
              {views.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>)}
            </div>

            {view === 'today' && <AskFeedback hasPlan={items.some((i) => courseById[i.courseId] && !courseById[i.courseId].sample)} open={setFb} />}
            {view === 'today' && (
              <Today steps={steps} items={visItems} isDone={isDone} toggle={toggle} skip={skip} moveTo={moveTo} itemById={itemById} courseById={courseById} firstStep={firstStep} jump={jumpToWeekOf} upsert={upsertItem} />
            )}
            {view === 'week' && (
              <Week steps={steps} offset={weekOffset} setOffset={setWeekOffset} isDone={isDone} toggle={toggle} skip={skip} moveTo={moveTo} itemById={itemById} courseById={courseById} firstStep={firstStep} jump={jumpToWeekOf} />
            )}
            {view === 'list' && (
              <Deadlines items={visItems} courses={courses.filter((c) => !filter || c.id === filter)} isDone={isDone} upsert={upsertItem} remove={removeItem} removeCourse={removeCourse} addTo={(id) => setSheet({ courseId: id })} />
            )}
          </>
        )}
        <footer className="made">
          {MAKER_URL ? <a href={MAKER_URL} target="_blank" rel="noopener"><Loop /> Made by <b>{MAKER}</b></a> : <span><Loop /> Made by <b>{MAKER}</b></span>}
          <span className="sep">·</span><span>Make what matters. Keep looping.</span>
        </footer>
      </main>

      {!empty && (
        <nav className="dock" aria-label="Views">
          {views.map(([k, l]) => <button key={k} aria-current={view === k ? 'page' : undefined} onClick={() => { setView(k); scrollTo({ top: 0 }); }}>{l}</button>)}
          <button className="plus" onClick={() => setSheet({})} aria-label="Add a syllabus">+</button>
        </nav>
      )}

      {sheet && (
        <ImportSheet
          course={courses.find((c) => c.id === sheet.courseId && !c.sample)}
          usedInks={courses.filter((c) => !c.sample).map((c) => c.color)}
          termStart={state.termStart || defaultTermStart()}
          onClose={() => setSheet(null)}
          onDone={addPlan}
        />
      )}
      {lms && <LmsSheet courses={courses} onClose={() => setLms(false)} onImport={importFeed} />}
      {fb && <Feedback session={session} onClose={() => setFb(false)} say={say} initialMood={typeof fb === 'string' ? fb : null} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && <button className="undo" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}

function Welcome({ onStart, onSample, onLms }) {
  return (
    <section className="welcome">
      <p className="kicker">Built for the January term · free</p>
      <h1>Your syllabus already knows <span className="hl">every deadline.</span> Let it plan your weeks.</h1>
      <p className="lede">Drop in the PDF or paste the text. Every assignment, quiz and exam becomes small dated steps, so the midterm stops being a surprise. It also tells you what you need on the final, and sends it all to your calendar.</p>
      <div className="row">
        <button className="btn" onClick={onStart}>Add my first syllabus</button>
        <button className="btn ghost" onClick={onSample}>Show me with a sample</button>
      </div>
      <p className="alt">On LEARN, MyLearningSpace or eConestoga? <button className="link" onClick={onLms}>Connect your course calendar instead</button></p>
      <ol className="how">
        <li><b>1</b> Drop a syllabus</li>
        <li><b>2</b> Fix anything we misread</li>
        <li><b>3</b> Tick off one small step a day</li>
      </ol>
    </section>
  );
}

// A quiet check-in: after a few days of real use, ask once how it's going (then not again for 3 weeks).
const ASK_KEY = 'stratag.fbAsk';
function askState() { try { return JSON.parse(localStorage.getItem(ASK_KEY)) || {}; } catch { return {}; } }
function AskFeedback({ hasPlan, open }) {
  const [st, setSt] = useState(askState);
  const save = (x) => { const n = { ...st, ...x }; setSt(n); try { localStorage.setItem(ASK_KEY, JSON.stringify(n)); } catch {} };
  useEffect(() => { if (hasPlan && !st.first) save({ first: Date.now() }); }, [hasPlan]);
  const DAY = 864e5;
  if (!hasPlan || !st.first || Date.now() - st.first < 3 * DAY || (st.last && Date.now() - st.last < 21 * DAY)) return null;
  const pick = (m) => { save({ last: Date.now() }); open(m); };
  return (
    <aside className="ask" aria-label="Quick question">
      <p><b>Quick one:</b> how's StratAG treating you so far? Your answer shapes what we fix next.</p>
      <div className="moods">
        {[['love', 'Love it'], ['ok', "It's fine"], ['meh', 'Annoying'], ['broken', 'Something broke']].map(([k, l]) => <button key={k} onClick={() => pick(k)}>{l}</button>)}
        <button className="link" onClick={() => save({ last: Date.now() })}>Not now</button>
      </div>
    </aside>
  );
}

function Today({ steps, items, isDone, toggle, skip, moveTo, itemById, courseById, firstStep, jump, upsert }) {
  const t = iso(today()), tm = iso(addDays(today(), 1));
  const late = steps.filter((s) => s.date < t && !isDone(s.id)).sort((a, b) => a.date.localeCompare(b.date));
  const todays = steps.filter((s) => s.date === t).sort((a, b) => (a.kind === 'due') - (b.kind === 'due'));
  const tomorrow = steps.filter((s) => s.date === tm && !isDone(s.id));
  const markBack = items.filter((i) => i.weight && i.score == null && i.due && i.due < t && i.due >= iso(addDays(today(), -28))).sort(byDue).slice(-2);
  const tba = items.filter((i) => !i.due);
  const [showAllLate, setShowAllLate] = useState(false);
  const allDone = todays.length > 0 && todays.every((s) => isDone(s.id));
  const p = { isDone, toggle, skip, moveTo, itemById, courseById };
  return (
    <section className="today-view">
      <h2 className="day-title">{fmt(today(), { weekday: 'long', month: 'long', day: 'numeric' })}</h2>

      {late.length > 0 && (
        <div className="catchup">
          <h3>Catch up <span>{plural(late.length, 'step')} slipped</span></h3>
          {(showAllLate ? late : late.slice(0, 3)).map((s) => <Step key={s.id} s={s} {...p} late actions />)}
          {late.length > 3 && <button className="link" onClick={() => setShowAllLate(!showAllLate)}>{showAllLate ? 'Show fewer' : `Show all ${late.length}`}</button>}
        </div>
      )}

      {todays.length > 0 ? (
        <div className="lines today-lines">
          {todays.map((s) => <Step key={s.id} s={s} {...p} />)}
          {allDone && <p className="stamp-line"><span className="aplus">A+</span> Today's done. Go do something fun.</p>}
        </div>
      ) : firstStep && firstStep > t ? (
        <div className="empty-day">
          <p>Nothing today.{daysBetween(today(), fromIso(firstStep)) > 6 ? ` Your plan kicks off ${fmt(fromIso(firstStep), { weekday: 'long', month: 'short', day: 'numeric' })}.` : ''}</p>
          <button className="btn ghost small" onClick={() => jump(firstStep)}>See that week</button>
        </div>
      ) : (
        <div className="empty-day"><p>Nothing on for today.{late.length ? ' Knock out a catch-up step instead?' : ' Enjoy it.'}</p></div>
      )}

      {tomorrow.length > 0 && (
        <div className="tomorrow">
          <span className="kicker">Tomorrow</span>
          <ul>{tomorrow.map((s) => <li key={s.id}><Ink c={courseById[itemById[s.itemId]?.courseId]} /> {s.kind === 'due' ? <b>Due: {s.text}</b> : s.text}</li>)}</ul>
        </div>
      )}

      {markBack.map((i) => <MarkBack key={i.id} item={i} course={courseById[i.courseId]} upsert={upsert} />)}

      {tba.length > 0 && (
        <p className="note tba-note">{plural(tba.length, 'deadline')} still {tba.length === 1 ? 'has' : 'have'} no date ({tba.map((i) => i.title).slice(0, 2).join(', ')}{tba.length > 2 ? '…' : ''}). Set {tba.length === 1 ? 'it' : 'them'} in Deadlines once your prof posts it.</p>
      )}
    </section>
  );
}

function MarkBack({ item, course, upsert }) {
  const [v, setV] = useState('');
  return (
    <form className="markback" style={{ '--ink': ink(course?.color) }} onSubmit={(e) => { e.preventDefault(); if (v !== '') upsert({ ...item, score: clamp(+v) }); }}>
      <span>Got your mark back for <b>{item.title}</b>?</span>
      <span className="row">
        <input type="number" min="0" max="110" step="0.5" placeholder="%" value={v} onChange={(e) => setV(e.target.value)} aria-label={'Mark for ' + item.title} />
        <button className="btn small" disabled={v === ''}>Save</button>
        <button type="button" className="link" onClick={() => upsert({ ...item, score: null, noMark: true })}>Not yet</button>
      </span>
    </form>
  );
}
const clamp = (n) => Math.max(0, Math.min(110, n));

function Week({ steps, offset, setOffset, isDone, toggle, skip, moveTo, itemById, courseById, firstStep, jump }) {
  const t = today();
  const start = addDays(mondayOf(t), offset * 7);
  const tIso = iso(t);
  const end = iso(addDays(start, 6));
  const inWeek = steps.filter((s) => s.date >= iso(start) && s.date <= end);
  const p = { isDone, toggle, skip, moveTo, itemById, courseById };
  // a heads-up strip: how loaded each of the next weeks is
  const load = [...Array(8)].map((_, w) => {
    const a = iso(addDays(mondayOf(t), w * 7)), b = iso(addDays(mondayOf(t), w * 7 + 6));
    return steps.filter((s) => s.date >= a && s.date <= b && !isDone(s.id)).length;
  });
  const max = Math.max(...load, 1);
  return (
    <section className="week">
      <div className="week-head">
        <button className="arrow" onClick={() => setOffset(offset - 1)} aria-label="Previous week">‹</button>
        <h2>{fmt(start)} <span>to</span> {fmt(addDays(start, 6))}</h2>
        <button className="arrow" onClick={() => setOffset(offset + 1)} aria-label="Next week">›</button>
        {offset !== 0 && <button className="link" onClick={() => setOffset(0)}>This week</button>}
      </div>
      <div className="loadbar" aria-label="How busy the next 8 weeks are">
        {load.map((n, w) => (
          <button key={w} className={w === offset ? 'on' : ''} onClick={() => setOffset(w)} title={`${fmt(addDays(mondayOf(t), w * 7))}: ${plural(n, 'step')}`}>
            <i style={{ height: `${Math.max(8, (n / max) * 100)}%`, opacity: n ? 1 : 0.25 }} />
          </button>
        ))}
      </div>
      {inWeek.length === 0 && offset === 0 && firstStep > end && (
        <div className="empty-day"><p>Quiet week. Your plan kicks off {fmt(fromIso(firstStep), { weekday: 'long', month: 'short', day: 'numeric' })}.</p><button className="btn ghost small" onClick={() => jump(firstStep)}>Jump there</button></div>
      )}
      <ol className="days">
        {DOW.map((d, i) => {
          const day = addDays(start, i);
          const k = iso(day);
          const list = inWeek.filter((s) => s.date === k).sort((a, b) => (a.kind === 'due') - (b.kind === 'due'));
          return (
            <li key={k} className={'day' + (k === tIso ? ' today' : '') + (k < tIso ? ' past' : '') + (list.length ? '' : ' free')}>
              <div className="date">
                <span className="dow">{d}</span>
                <span className="num">{day.getDate()}{k === tIso && <Circle />}</span>
              </div>
              <div className="lines">
                {list.length === 0 ? <span className="nothing">{i >= 5 ? 'go outside' : 'free'}</span> :
                  list.map((s) => <Step key={s.id} s={s} {...p} late={k < tIso} actions={k < tIso} />)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Step({ s, isDone, toggle, skip, moveTo, itemById, courseById, late, actions }) {
  const done = isDone(s.id);
  const item = itemById[s.itemId];
  const course = courseById[item?.courseId];
  return (
    <div className={'step' + (s.kind === 'due' ? ' due' : '') + (done ? ' done' : '') + (late && !done ? ' late' : '')} style={{ '--ink': ink(course?.color) }}>
      <label className="hit">
        <input type="checkbox" checked={done} onChange={() => toggle(s.id)} />
        <span className="box" aria-hidden="true"><Tick /></span>
        <span className="txt">
          {s.kind === 'due' && <strong className="stamp">Due{s.time ? ' ' + fmtTime(s.time) : ''}</strong>}
          {s.text}
          {s.ctx && <span className="ctx"> · {s.ctx}</span>}
          <span className="course">
            {course?.name}{s.kind === 'due' && item?.weight ? ` · ${item.weight}%` : ''}
            {late && !done && <span className="late-tag">late</span>}
          </span>
        </span>
      </label>
      {actions && !done && s.kind === 'step' && (
        <span className="acts">
          <button className="link" onClick={() => moveTo(s.id, iso(today()))}>Do today</button>
          <button className="link" onClick={() => moveTo(s.id, iso(addDays(today(), 1)))}>Tomorrow</button>
          <button className="link" onClick={() => skip(s.id)}>Skip</button>
        </span>
      )}
    </div>
  );
}

function Deadlines({ items, courses, isDone, upsert, remove, removeCourse, addTo }) {
  const [editing, setEditing] = useState(null);
  const t = iso(today());
  return (
    <section className="ledger">
      {courses.map((c) => {
        const list = items.filter((i) => i.courseId === c.id).sort(byDue);
        const total = list.reduce((n, i) => n + (i.weight || 0), 0);
        return (
          <div key={c.id} className="course-block" style={{ '--ink': ink(c.color) }}>
            <div className="course-head">
              <h2>{c.name}</h2>
              <span className="meta">{plural(list.length, 'deadline')}{total ? ` · ${total}% of your grade` : ''}</span>
              <button className="link" onClick={() => setEditing({ id: uid(), courseId: c.id, title: '', type: 'asg', due: iso(addDays(today(), 7)), weight: null, plannedFrom: t, isNew: true })}>+ Add one</button>
              {!c.sample && <button className="link" onClick={() => addTo(c.id)}>Add from text</button>}
              <button className="link danger" onClick={() => removeCourse(c.id)}>Remove course</button>
            </div>
            {total > 0 && total < 95 && <p className="warn">Weights only add up to {total}%. Something's missing, maybe the final? Use "+ Add one".</p>}
            {total > 105 && <p className="warn">Weights add up to {total}%. Check for a duplicate.</p>}
            <Grades list={list} upsert={upsert} />
            <ul>
              {editing?.isNew && editing.courseId === c.id && <EditRow it={editing} save={(x) => { const { isNew, ...rest } = x; upsert(rest); setEditing(null); }} cancel={() => setEditing(null)} />}
              {list.map((i) => editing?.id === i.id ? (
                <EditRow key={i.id} it={editing} save={(x) => { upsert({ ...x, edited: true }); setEditing(null); }} cancel={() => setEditing(null)} remove={() => { remove(i.id); setEditing(null); }} />
              ) : (
                <li key={i.id} className={'dl' + (i.due && i.due < t ? ' gone' : '') + (!i.due ? ' tba' : '')}>
                  <span className="when">{i.due ? fmt(fromIso(i.due), { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBA'}{i.time ? ' · ' + fmtTime(i.time) : ''}</span>
                  <span className="what">
                    {i.title}
                    {i.guessed && <em title="We worked this date out. Double check it."> · check date</em>}
                    {isDone(i.id + '-due') && <span className="done-stamp">Done</span>}
                  </span>
                  <span className="kind">{typeOf(i.type).label}{i.weight ? ` · ${i.weight}%` : ''}{i.score != null ? ` · got ${i.score}%` : ''}</span>
                  <button className="link" onClick={() => setEditing({ ...i })}>{i.due ? 'Edit' : 'Set date'}</button>
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
      <label className="fl wide">Title<input value={x.title} placeholder="e.g. Lab 3" onChange={f('title')} autoFocus /></label>
      <label className="fl">Due<input type="date" value={x.due || ''} onChange={(e) => setX({ ...x, due: e.target.value || null })} /></label>
      <label className="fl">Time<input type="time" value={x.time || ''} onChange={f('time')} /></label>
      <label className="fl">Type<select value={x.type} onChange={f('type')}>{TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select></label>
      <label className="fl">Worth %<input type="number" min="0" max="100" step="0.5" value={x.weight ?? ''} onChange={(e) => setX({ ...x, weight: e.target.value === '' ? null : Math.min(100, +e.target.value) })} /></label>
      <span className="row edit-acts">
        {remove && <button className="link danger" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="link" onClick={cancel}>Cancel</button>
        <button className="btn small" disabled={!x.title.trim()} onClick={() => save({ ...x, title: x.title.trim(), guessed: false, plannedFrom: x.due !== it.due ? iso(today()) : x.plannedFrom })}>Save</button>
      </span>
    </li>
  );
}

// Week 1 Monday presets. Ontario winter terms start the first week of January.
function termOptions(ts0) {
  const d = today();
  const y = d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
  const mon = (date) => iso(mondayOf(date));
  const opts = [
    [mon(addDays(new Date(y, 0, 1), 3)), `Winter ${y}`],
    [mon(addDays(new Date(y, 4, 1), 3)), `Spring ${y}`],
    [mon(addDays(new Date(y, 8, 1), 3)), `Fall ${y}`],
  ];
  if (!opts.some(([v]) => v === ts0)) opts.unshift([ts0, 'Custom']);
  return opts;
}

function ImportSheet({ course, usedInks, termStart: ts0, onClose, onDone }) {
  const [name, setName] = useState(course?.name || '');
  const [color] = useState(course?.color || INKS.find((c) => !usedInks.includes(c)) || INKS[usedInks.length % INKS.length]);
  const [termStart, setTermStart] = useState(ts0);
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');

  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);

  const readFile = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        const { pdfToText, ocrPdf } = await import('./lib/pdf.js');
        let t = await pdfToText(file);
        if (t.trim().length < 40) { setErr(''); t = await ocrPdf(file, setProgress); setProgress(''); }
        if (t.trim().length < 40) throw new Error('scanned');
        setText(t);
        if (!name) setName(guessCourse(t) || guessCourse(file.name));
      } else if (/^image\//.test(file.type)) {
        setProgress('Reading your photo…');
        const { makeOcr } = await import('./lib/pdf.js');
        const w = await makeOcr(); const { data } = await w.recognize(file); await w.terminate();
        setProgress(''); setText(data.text); if (!name) setName(guessCourse(data.text));
      } else { const t = await file.text(); setText(t); if (!name) setName(guessCourse(t)); }
    } catch (e) {
      setErr(e.message === 'scanned' ? "We couldn't read any text in that PDF, even with photo reading. Try a clearer copy, or paste the grading table in by hand." : "Couldn't read that file. Try copying the text and pasting it instead.");
    }
    setBusy(false);
  };

  const run = () => {
    const r = parseSyllabus(text, { termStart });
    // anything far outside the term is probably misread (e.g. 10/02 read as Oct 2)
    const lo = iso(addDays(fromIso(termStart), -21)), hi = iso(addDays(fromIso(termStart), 150));
    setFound(r.map((i) => (i.due && (i.due < lo || i.due > hi) ? { ...i, guessed: true } : i)));
    if (!name.trim()) setName(guessCourse(text) || 'My course');
  };

  const edit = (id, k, v) => setFound(found.map((i) => (i.id === id ? { ...i, [k]: v, guessed: k === 'due' ? false : i.guessed } : i)));
  const total = found ? found.reduce((n, i) => n + (i.weight || 0), 0) : 0;

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" style={{ '--ink': ink(color) }}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        {!found ? (
          <>
            <h2 id="sheet-h">{course ? `More for ${course.name}` : 'Add a syllabus'}</h2>
            <div className="fields">
              <label>Course<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PSYC 101" /></label>
              <label>Term
                {!custom ? (
                  <select value={termStart} onChange={(e) => (e.target.value === 'custom' ? setCustom(true) : setTermStart(e.target.value))}>
                    {termOptions(ts0).map(([v, l]) => <option key={v + l} value={v}>{l} · classes start week of {fmt(fromIso(v))}</option>)}
                    <option value="custom">Other date…</option>
                  </select>
                ) : <input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />}
                <small>Helps us turn "Week 5" into a real date</small>
              </label>
            </div>
            <div className={'drop' + (drag ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste the syllabus here, or drop the PDF on this box.\n\nThe grading table and the schedule are the parts that matter.'} />
              <div className="drop-bar">
                <label className="btn ghost small file">{busy ? (progress || 'Reading…') : 'Choose a PDF or photo'}<input type="file" accept=".pdf,.txt,application/pdf,text/plain,image/*" onChange={(e) => readFile(e.target.files[0])} hidden /></label>
                <span className="note">Your file never leaves your device. Scanned PDFs work too, they just take longer.</span>
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
              <p className="lede">We look for lines with a date and a word like quiz, exam, essay, lab or assignment. Try pasting just the grading table or the schedule, or add them by hand below.</p>
            ) : (
              <p className="lede">Tap anything to fix it. Orange dates are our best guess, so double check those.{total > 0 && total < 95 ? ` Weights add up to ${total}%, so something may be missing.` : ''}</p>
            )}
            <ul className="review">
              {found.map((i) => (
                <li key={i.id}>
                  <input aria-label="Title" value={i.title} onChange={(e) => edit(i.id, 'title', e.target.value)} className="t" />
                  <input aria-label="Due date" type="date" value={i.due || ''} onChange={(e) => edit(i.id, 'due', e.target.value || null)} className={i.guessed || !i.due ? 'guess' : ''} />
                  <select aria-label="Type" value={i.type} onChange={(e) => edit(i.id, 'type', e.target.value)}>{TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select>
                  <label className="w"><input aria-label="Weight %" type="number" min="0" max="100" step="0.5" placeholder="–" value={i.weight ?? ''} onChange={(e) => edit(i.id, 'weight', e.target.value === '' ? null : Math.min(100, +e.target.value))} />%</label>
                  <button className="link danger" onClick={() => setFound(found.filter((x) => x.id !== i.id))} aria-label={'Remove ' + i.title}>×</button>
                </li>
              ))}
            </ul>
            <button className="link" onClick={() => setFound([...found, { id: uid(), title: '', type: 'asg', due: null, weight: null }])}>+ Add a row</button>
            <div className="row end">
              <button className="link" onClick={() => setFound(null)}>Back to the text</button>
              <button className="btn" disabled={!found.some((i) => i.title.trim()) || !name.trim()} onClick={() => onDone({ course: { id: course?.id || uid(), name: name.trim(), color }, newItems: found.filter((i) => i.title.trim()), termStart })}>Plan it</button>
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

function Account({ session, sync, say, label }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (!supabase) return <p className="saved">Saved on this device</p>;
  if (session) {
    return (
      <div className="acct">
        <p className="saved">{{ synced: 'Synced', syncing: 'Syncing…', error: "Couldn't sync, will retry", local: 'Saved' }[sync]} · {session.user.email}</p>
        <span className="row">
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
          <button className="link danger" onClick={async () => {
            if (!window.confirm('Delete your synced plan from our servers and this device? This cannot be undone.')) return;
            await supabase.from('plans').delete().eq('user_id', session.user.id);
            try { localStorage.clear(); } catch {}
            await supabase.auth.signOut(); location.reload();
          }}>Delete my data</button>
        </span>
      </div>
    );
  }
  const send = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) say(/rate/i.test(error.message) ? 'Too many sign-in emails right now. Try again in a few minutes.' : error.message); else setSent(true);
  };
  return (
    <div className="acct">
      {label === 'Sync to your phone' && <p className="saved">Saved on this device only</p>}
      {!open ? <button className="link" onClick={() => setOpen(true)}>{label}</button> : sent ? (
        <p className="saved">Check {email} for a sign-in link. Open it on this device.</p>
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
const Ink = ({ c }) => <span className="ink" style={{ background: ink(c?.color) }} />;
const Meter = ({ v }) => (
  <svg viewBox="0 0 40 40" className="meter" aria-hidden="true">
    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--rule)" strokeWidth="5" />
    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ember)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${v * 100.5} 200`} transform="rotate(-90 20 20)" />
  </svg>
);

// Ontario university scale (UW, Laurier and most others use percentages; Conestoga's A starts at 80).
const TARGETS = [['A+', 90], ['A', 85], ['A−', 80], ['B+', 77], ['B', 73], ['B−', 70], ['C', 60], ['Pass', 50]];
function Grades({ list, upsert }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(80);
  const weighted = list.filter((i) => i.weight);
  if (!weighted.length) return null;
  const graded = weighted.filter((i) => i.score != null);
  const gw = graded.reduce((n, i) => n + i.weight, 0);
  const earned = graded.reduce((n, i) => n + (i.weight * i.score) / 100, 0);
  const total = weighted.reduce((n, i) => n + i.weight, 0);
  const left = +(total - gw).toFixed(2);
  const need = left > 0 ? ((target / 100) * total - earned) / left * 100 : null;
  const worst = graded.filter((i) => i.score < target).sort((a, b) => (b.weight * (target - b.score)) - (a.weight * (target - a.score)))[0];
  return (
    <div className="grades">
      <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide marks' : graded.length ? `Your mark so far: ${(earned / gw * 100).toFixed(1)}% · what you need` : 'Add your marks · see what you need'}</button>
      {open && (
        <>
          <ul className="marks">
            {weighted.map((i) => (
              <li key={i.id}>
                <span>{i.title} <em>{i.weight}%</em></span>
                <input type="number" min="0" max="110" step="0.5" placeholder="mark %" aria-label={'Mark for ' + i.title}
                  value={i.score ?? ''} onChange={(e) => upsert({ ...i, score: e.target.value === '' ? null : clamp(+e.target.value) })} />
              </li>
            ))}
          </ul>
          <div className="verdict">
            <label>Aiming for <select value={target} onChange={(e) => setTarget(+e.target.value)}>{TARGETS.map(([l, v]) => <option key={v} value={v}>{l} ({v}%)</option>)}</select></label>
            {graded.length === 0 ? <p>Enter a mark when you get one back, and this tells you what you need on everything left.</p> :
              left <= 0 ? <p>All graded. You finished with <b>{(earned / total * 100).toFixed(1)}%</b>.</p> :
              need > 100 ? <p>You'd need <b>{need.toFixed(0)}%</b> on the remaining {left}%, which is out of reach. Ask your prof about bonus marks or a remark, or set a new target.</p> :
              need <= 0 ? <p>You've already locked it in. Anything on the last {left}% is a bonus.</p> :
              <p>You need an average of <b>{need.toFixed(0)}%</b> on the remaining {left}% of the course.</p>}
            {worst && left > 0 && <p className="tip">Biggest gap: <b>{worst.title}</b> ({worst.score}% on a {worst.weight}% item). Look at what went wrong there before the next one like it.</p>}
            <p className="tip small">Scales differ by school. Check your course outline.</p>
          </div>
        </>
      )}
    </div>
  );
}
