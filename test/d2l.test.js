import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseSyllabus } from '../src/lib/parse.js';

describe('D2L Instructional Plan (Conestoga)', () => {
  const r = parseSyllabus(fs.readFileSync(new URL('./fixtures/d2l-plan.txt', import.meta.url), 'utf8'), { termStart: '2026-09-07' });
  it('finds every graded item with its due date, time and weight', () => {
    expect(r.map((x) => [x.title, x.due, x.time, x.weight])).toEqual([
      ['Assignment 1', '2026-10-09', '23:00', 15],
      ['Term Test', '2026-10-19', '23:59', 10],
      ['Assignment 2', '2026-10-23', '23:00', 15],
      ['Assignment 3', '2026-11-20', '23:00', 15],
      ['InClass 1', '2026-11-23', '15:00', 10],
      ['InClass 2', '2026-11-30', '15:00', 10],
      ['Project', '2026-12-11', '23:00', 25],
    ]);
  });
  it('adds up to 100% and skips weekly schedule rows', () => {
    expect(r.reduce((n, x) => n + x.weight, 0)).toBe(100);
    expect(r.some((x) => /week|no exam/i.test(x.title))).toBe(false);
  });
});
