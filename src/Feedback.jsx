import { useEffect, useState } from 'react';
import { supabase } from './lib/store.js';

// One-tap feedback straight into the Supabase `feedback` table (insert-only for everyone).
export function Feedback({ session, onClose, say, initialMood = null }) {
  const [msg, setMsg] = useState('');
  const [mood, setMood] = useState(initialMood);
  const [email, setEmail] = useState(session?.user?.email || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    const row = { message: msg.trim().slice(0, 3000), mood, email: email.trim() || null, user_id: session?.user?.id || null, page: location.pathname, ua: navigator.userAgent.slice(0, 200) };
    const { error } = supabase ? await supabase.from('feedback').insert(row) : { error: true };
    setBusy(false);
    if (error) { say("Couldn't send that. Try again in a minute."); return; }
    onClose(); say('Got it. Thank you, this genuinely helps.');
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet fb" role="dialog" aria-modal="true" aria-labelledby="fb-h" onSubmit={send}>
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        <h2 id="fb-h">Tell us straight</h2>
        <div className="moods" role="radiogroup" aria-label="How's it going">
          {[['love', 'Love it'], ['ok', "It's fine"], ['meh', 'Annoying'], ['broken', 'Something broke']].map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={mood === k} className={mood === k ? 'on' : ''} onClick={() => setMood(k)}>{l}</button>
          ))}
        </div>
        <label className="fl wide">What happened, or what should we add?<textarea required value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} placeholder="e.g. It missed my lab dates. The syllabus had them in a table." /></label>
        <label className="fl wide">Email (optional, if you want a reply)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ca" /></label>
        <div className="row end"><button className="btn" disabled={busy || !msg.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
      </form>
    </div>
  );
}
