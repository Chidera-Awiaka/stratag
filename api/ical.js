// Fetches a course calendar feed (LEARN / MyLearningSpace / eConestoga are all D2L Brightspace)
// on the student's behalf, because browsers can't read other sites' feeds directly (CORS).
// Only calendar hosts are allowed, so this can't be used as an open proxy.
const ALLOWED = [
  /\.uwaterloo\.ca$/, /\.wlu\.ca$/, /\.conestogac\.on\.ca$/, /\.desire2learn\.com$/, /\.brightspace\.com$/,
  /\.d2l\.com$/, /^calendar\.google\.com$/, /^outlook\.(office365|live)\.com$/, /\.instructure\.com$/,
];

export default async function handler(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '').replace(/^webcal:/i, 'https:')); } catch { return res.status(400).send('Bad link'); }
  if (u.protocol !== 'https:' || !ALLOWED.some((r) => r.test(u.hostname))) return res.status(400).send('That link is not a school calendar feed');
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(u, { signal: ctrl.signal, headers: { 'user-agent': 'StratAG calendar import' } });
    clearTimeout(t);
    const body = await r.text();
    if (!r.ok || !body.includes('BEGIN:VCALENDAR')) return res.status(502).send('That link did not return a calendar');
    if (body.length > 3_000_000) return res.status(413).send('Calendar too large');
    res.setHeader('content-type', 'text/calendar; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.status(200).send(body);
  } catch {
    return res.status(504).send('Could not reach that calendar');
  }
}
