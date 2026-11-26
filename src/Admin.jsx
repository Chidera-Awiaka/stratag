import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/store.js';
import { APP_NAME } from './config.js';

// Private feedback dashboard at /admin. Rows are readable only by people in the `admins` table
// (see supabase/feedback.sql), so the page is safe to ship publicly: anyone else just sees nothing.

// Rule-based themes (no AI cost). A message can land in more than one.
const THEMES = [
  ['Reading syllabi', /syllab|outline|instructional|course plan|pdf|scan|photo|pars|import|read (it|my)|didn'?t (pick|find|get)|missed|missing|table/i],
  ['Wrong dates or times', /wrong (date|day|time|week)|(dates?|due|deadlines?|times?) (was|were|is|are|came out) (wrong|off|missing)|off by|time ?zone|a day (early|late)/i],
  ['LEARN / D2L', /\blearn\b|d2l|brightspace|mylearningspace|econestoga|desire2learn|feed|subscribe/i],
  ['Sign-in and sync', /sign|log ?in|magic link|e-?mail|sync|phone|laptop|account|password/i],
  ['Grades', /grade|mark|gpa|percent|%|weight|score/i],
  ['Steps and planning', /\bsteps?\b|workload|too (many|much)|busy|overwhelm|schedule|remind|notif/i],
  ['Look and feel', /design|colou?r|font|ugly|dark mode|look|layout|confus|hard to (find|use|read)|button|small|big/i],
  ['Bugs and speed', /slow|crash|broke|bug|error|freez|stuck|not work|doesn'?t work|won'?t|glitch|blank|won'?t load|not loading/i],
  ['Ideas and requests', /\badd\b|wish|would be|could you|can you|feature|want|please|should|idea|integrat|app store/i],
  ['Praise', /love|great|amazing|helpful|thank|awesome|nice|useful|best/i],
];
const MOODS = { love: 'Love it', ok: "It's fine", meh: 'Annoying', broken: 'Something broke' };
const themesOf = (r) => { const t = THEMES.filter(([, re]) => re.test(r.message)).map(([n]) => n); return t.length ? t : ['Other']; };
const when = (d) => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [theme, setTheme] = useState(null);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    document.title = `Feedback · ${APP_NAME}`;
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = async () => {
    setErr('');
    const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) { setErr(error.message); setRows([]); return; }
    setRows(data.map((r) => ({ ...r, themes: themesOf(r) })));
    const a = await supabase.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    setIsAdmin(!a.error && !!a.data);
  };
  useEffect(() => { if (session) load(); }, [session?.user?.id]);

  const toggleHandled = async (r) => {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, handled: !r.handled } : x)));
    const { error } = await supabase.from('feedback').update({ handled: !r.handled }).eq('id', r.id);
    if (error) { setErr(error.message); load(); }
  };

  const open = useMemo(() => (rows || []).filter((r) => showDone || !r.handled), [rows, showDone]);
  const counts = useMemo(() => {
    const c = {};
    for (const r of open) for (const t of r.themes) c[t] = (c[t] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [open]);
  const shown = open.filter((r) => (!theme || r.themes.includes(theme)) && (!q || (r.message + ' ' + (r.email || '')).toLowerCase().includes(q.toLowerCase())));
  const week = (rows || []).filter((r) => Date.now() - new Date(r.created_at) < 7 * 864e5).length;
  const unhappy = (rows || []).filter((r) => r.mood === 'meh' || r.mood === 'broken').length;
  const max = counts[0]?.[1] || 1;

  const csv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['date', 'mood', 'themes', 'message', 'email', 'handled'].join(',')]
      .concat(shown.map((r) => [r.created_at, r.mood, r.themes.join('; '), r.message, r.email, r.handled].map(esc).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `stratag-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (session === undefined) return <main className="admin"><p className="sub">Loading…</p></main>;
  if (!session) return (
    <main className="admin">
      <h1>Feedback</h1>
      <p className="sub">Sign in on <a href="/">{APP_NAME}</a> first (the same email you made an admin), then come back to this page.</p>
    </main>
  );

  return (
    <main className="admin">
      <h1>What students are telling you</h1>
      <p className="sub">Signed in as {session.user.email} · <a href="/">Back to {APP_NAME}</a></p>
      {err && <p className="err">{err}</p>}
      {rows && rows.length === 0 && !err && (
        isAdmin === false
          ? <p className="sub">This account isn't on the admin list yet. Run <code>supabase/feedback.sql</code> in Supabase with this email on the last line, then refresh.</p>
          : <p className="sub">You're all set as an admin. No feedback has come in yet. When students send some, it shows up here grouped by theme. (Try it: send yourself a message with "Send feedback" on <a href="/">{APP_NAME}</a>, then refresh.)</p>
      )}
      {rows && rows.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><b>{rows.length}</b><span>messages in total</span></div>
            <div className="stat"><b>{week}</b><span>in the last 7 days</span></div>
            <div className="stat"><b>{rows.filter((r) => !r.handled).length}</b><span>not handled yet</span></div>
            <div className="stat"><b>{unhappy}</b><span>annoyed or broken</span></div>
          </div>

          <h2>Common themes</h2>
          <div className="themes">
            {counts.map(([t, n]) => (
              <button key={t} className={'theme' + (theme === t ? ' on' : '')} onClick={() => setTheme(theme === t ? null : t)} aria-pressed={theme === t}>
                <span>{t}</span><span className="bar" style={{ width: `${(n / max) * 100}%` }} /><span className="n">{n}</span>
              </button>
            ))}
          </div>

          <h2>{theme ? `${theme} (${shown.length})` : `Messages (${shown.length})`}</h2>
          <div className="tools">
            <input type="search" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
            <label><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show handled</label>
            <button className="btn small ghost" onClick={csv}>Download CSV</button>
            <button className="btn small ghost" onClick={load}>Refresh</button>
          </div>
          {shown.map((r) => (
            <article key={r.id} className={'fbrow' + (r.handled ? ' done' : '')}>
              <div className="meta">
                <span>{when(r.created_at)}</span>
                {r.mood && <span className={'mood-' + r.mood}>{MOODS[r.mood] || r.mood}</span>}
                {r.themes.map((t) => <span key={t} className="tag">{t}</span>)}
                {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                <button className="link" onClick={() => toggleHandled(r)}>{r.handled ? 'Reopen' : 'Mark handled'}</button>
              </div>
              <p>{r.message}</p>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
