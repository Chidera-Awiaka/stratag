// Local-first state with optional Supabase sync.
// Everything lives in localStorage; when signed in, the whole plan is merged with the
// copy in Supabase (per-record "last edit wins", deletes kept as tombstones).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const KEY = 'ikiloop.plan.v1';
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const emptyState = () => ({ courses: [], items: [], done: {}, moves: {}, termStart: null, v: 1 });

export function loadLocal() {
  try { return { ...emptyState(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return emptyState(); }
}
export function saveLocal(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

function mergeList(a = [], b = []) {
  const m = new Map();
  for (const x of [...a, ...b]) {
    const cur = m.get(x.id);
    if (!cur || (x.t || 0) > (cur.t || 0)) m.set(x.id, x);
  }
  return [...m.values()];
}
function mergeDone(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v.t || 0) > (out[k].t || 0)) out[k] = v;
  return out;
}
export function merge(a, b) {
  if (!b) return a;
  return {
    ...a,
    courses: mergeList(a.courses, b.courses),
    items: mergeList(a.items, b.items),
    done: mergeDone(a.done, b.done),
    moves: mergeDone(a.moves, b.moves),
    termStart: (a.termStartT || 0) >= (b.termStartT || 0) ? a.termStart : b.termStart,
    termStartT: Math.max(a.termStartT || 0, b.termStartT || 0),
  };
}

export async function pull(userId) {
  const { data, error } = await supabase.from('plans').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.data || null;
}
export async function push(userId, state) {
  const { error } = await supabase.from('plans').upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}
