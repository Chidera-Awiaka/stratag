// Real-world style excerpts (UW, Laurier, Conestoga). Guards recall/precision so parser changes can't quietly regress.
import { it, expect } from 'vitest';
import { parseSyllabus } from '../src/lib/parse.js';
import { cases, TERM } from './fixtures/syllabi.mjs';

const inRange = (d, e) => (Array.isArray(e) ? d >= e[0] && d <= e[1] : d === e);

it('finds most deadlines in realistic syllabi without inventing many', () => {
  let tp = 0, fp = 0, fn = 0, tbaKept = 0, tbaN = 0;
  for (const c of cases) {
    const got = parseSyllabus(c.text, { termStart: TERM });
    const used = new Set();
    for (const e of c.expect) {
      if (e.due === null) {
        tbaN++;
        const i = got.findIndex((g, k) => !used.has(k) && g.due === null && g.title.toLowerCase().includes(e.key));
        if (i >= 0) { used.add(i); tbaKept++; }
        continue;
      }
      let i = got.findIndex((g, k) => !used.has(k) && g.due && inRange(g.due, e.due) && g.title.toLowerCase().includes(e.key));
      if (i < 0) i = got.findIndex((g, k) => !used.has(k) && g.due && inRange(g.due, e.due));
      if (i < 0) fn++; else { used.add(i); tp++; }
    }
    fp += got.filter((g, k) => !used.has(k)).length;
  }
  expect(tp / (tp + fn)).toBeGreaterThan(0.9);
  expect(tp / (tp + fp)).toBeGreaterThan(0.9);
  expect(tbaKept / tbaN).toBeGreaterThan(0.6);
});
