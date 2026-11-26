import { addDays, today } from './lib/dates.js';
// Dates are relative to today so the sample always looks alive.
export function sampleSyllabus() {
  const f = (n) => addDays(today(), n).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `PSYC 201: Research Methods (sample)
Instructor office hours: Tuesdays 2-4pm

Evaluation
Reading response 1 ............ due ${f(3)} (5%)
Lab report 1: Memory experiment, due ${f(6)} by 11:59 pm (15%)
Quiz 1 (chapters 1-4) ......... ${f(9)} (5%)
Midterm exam .................. ${f(17)}, in class (25%)
Group presentation ............ ${f(24)} (10%)
Final research paper due ${f(31)} at 11:59pm (25%)
Final exam .................... ${f(38)} (15%)`;
}
