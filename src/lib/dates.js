export const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const fromIso = (s) => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const daysBetween = (a, b) => Math.round((b - a) / 864e5);
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
export const fmt = (d, o = { month: 'short', day: 'numeric' }) => d.toLocaleDateString('en-CA', o);
export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm');
};
