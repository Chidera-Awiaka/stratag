import { describe, it, expect } from 'vitest';
import { parseSyllabus, stepsFor, defaultTermStart } from '../src/lib/parse.js';

const T = '2027-01-04';
const p = (s) => parseSyllabus(s, { termStart: T });

describe('parseSyllabus', () => {
  it('reads common date formats and years from the term', () => {
    const r = p(`Quiz 1: Jan 20 (5%)
Midterm exam February 24th, 2027 in class (25%)
Lab report 2 due 12 March by 11:59 pm (15%)
Essay draft 2027-03-30
Assignment 3 due 4/2`);
    expect(r.map((x) => x.due)).toEqual(['2027-01-20', '2027-02-24', '2027-03-12', '2027-03-30', '2027-04-02']);
    expect(r[0]).toMatchObject({ type: 'quiz', weight: 5, title: 'Quiz 1' });
    expect(r[1]).toMatchObject({ type: 'exam', weight: 25 });
    expect(r[2]).toMatchObject({ type: 'paper', time: '23:59', title: 'Lab report 2' });
  });
  it('handles Week N with a weekday', () => {
    const r = p(`Week 3 Wed: Quiz on chapter 2
Week 6 - Midterm test
Week 2: Intro to cells`);
    expect(r.map((x) => x.due)).toEqual(['2027-01-20', '2027-02-12']);
    expect(r[0].guessed).toBe(true);
  });
  it('skips holidays, office hours and schedule noise', () => {
    expect(p(`Feb 16 Family Day - no class
Reading week Feb 16-20
Jan 12 Introduction to the course`)).toEqual([]);
  });
  it('reads day/month when the first number is over 12', () => {
    expect(p('Project due 20/03/2027')[0].due).toBe('2027-03-20');
  });
  it('joins PDF table cells', () => {
    const r = p('Assignment 1 | Jan 30 | 10%');
    expect(r[0]).toMatchObject({ title: 'Assignment 1', due: '2027-01-30', weight: 10 });
  });
  it('dedupes the same deadline listed twice', () => {
    expect(p('Midterm exam Feb 24 (25%)\nFeb 24 Midterm exam').length).toBe(1);
  });
});

describe('stepsFor', () => {
  it('spreads steps when time is short and never before the planned day', () => {
    const s = stepsFor({ id: 'a', title: 'Essay', type: 'paper', due: '2027-01-10' }, '2027-01-06');
    expect(s.every((x) => x.date >= '2027-01-06' && x.date <= '2027-01-10')).toBe(true);
    expect(s.at(-1).kind).toBe('due');
  });
  it('uses normal lead times when there is room', () => {
    const s = stepsFor({ id: 'b', title: 'Quiz', type: 'quiz', due: '2027-02-10' }, '2027-01-04');
    expect(s.map((x) => x.date)).toEqual(['2027-02-07', '2027-02-09', '2027-02-10']);
    expect(s[0].id).toBe('b-quiz-0');
  });
});

it('small items get fewer steps and TBA items get none', () => {
  expect(stepsFor({ id: 'c', title: 'Lab 2', type: 'paper', due: '2027-02-10', weight: 3 }, '2027-01-04').length).toBe(2);
  expect(stepsFor({ id: 'd', title: 'Final', type: 'exam', due: null, weight: 40 }, '2027-01-04')).toEqual([]);
});

it('default term start is the first January Monday when planning in Nov', () => {
  expect(defaultTermStart(new Date(2026, 10, 26))).toBe('2027-01-04');
});
