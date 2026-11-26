// Realistic Winter 2027 syllabus excerpts (week 1 Monday = 2027-01-04).
// expect: { key: substring a good title contains, due: 'YYYY-MM-DD' | [from,to] (any day in a week/window ok) | null (TBA: no date yet),
//           type?, weight?, time? }
export const TERM = '2027-01-04';
export const cases = [
{ name: '01 UW grading table (LEARN), weekday + year + time range', text:
`Assessment | Weight | Due Date
Assignment 1 | 10% | Friday, January 22, 2027
Assignment 2 | 10% | Friday, February 12, 2027
Midterm Exam | 25% | Wednesday, February 24, 2027, 7:00-8:50 PM
Assignment 3 | 10% | Friday, March 19, 2027
Final Exam | 45% | TBA (scheduled by the Registrar's Office during the final exam period)`,
expect: [
 { key: 'assignment 1', due: '2027-01-22', type: 'asg', weight: 10 },
 { key: 'assignment 2', due: '2027-02-12', type: 'asg', weight: 10 },
 { key: 'midterm', due: '2027-02-24', type: 'exam', weight: 25, time: '19:00' },
 { key: 'assignment 3', due: '2027-03-19', type: 'asg', weight: 10 },
 { key: 'final exam', due: null, type: 'exam', weight: 45 },
]},
{ name: '02 UW assignment blocks: title line, then "Due:" line', text:
`Assignment 1: Linked Lists
Due: Friday, January 22nd at 11:59 PM EST
Submit to the Assignment 1 dropbox on LEARN.

Assignment 2: Binary Search Trees
Due: Friday, February 5th at 11:59 PM EST

Assignment 3: Hashing
Due: Friday, March 5th at 11:59 PM EST`,
expect: [
 { key: 'assignment 1', due: '2027-01-22', type: 'asg', time: '23:59' },
 { key: 'assignment 2', due: '2027-02-05', type: 'asg', time: '23:59' },
 { key: 'assignment 3', due: '2027-03-05', type: 'asg', time: '23:59' },
]},
{ name: '03 Laurier weekly schedule table with date ranges', text:
`Week | Dates | Topic | Readings | Due
Week 1 | Jan 4-8 | Introduction to Microeconomics | Ch. 1 |
Week 2 | Jan 11-15 | Supply and Demand | Ch. 2-3 | Quiz 1 (online, MyLearningSpace)
Week 3 | Jan 18-22 | Elasticity | Ch. 4 | Problem Set 1 due Jan 22
Week 4 | Jan 25-29 | Consumer Choice | Ch. 5 | Quiz 2
Week 5 | Feb 1-5 | Production and Costs | Ch. 6 |
Week 6 | Feb 8-12 | Perfect Competition | Ch. 7 | Midterm Exam (Feb 11, in class)
Week 7 | Feb 15-19 | Reading Week - no classes |
Week 8 | Feb 22-26 | Monopoly | Ch. 8 | Quiz 3
Week 9 | Mar 1-5 | Oligopoly | Ch. 9 | Problem Set 2 due Mar 5
Week 12 | Mar 22-26 | Review | | Quiz 4`,
expect: [
 { key: 'quiz 1', due: ['2027-01-11', '2027-01-15'], type: 'quiz' },
 { key: 'problem set 1', due: '2027-01-22', type: 'asg' },
 { key: 'quiz 2', due: ['2027-01-25', '2027-01-29'], type: 'quiz' },
 { key: 'midterm', due: '2027-02-11', type: 'exam' },
 { key: 'quiz 3', due: ['2027-02-22', '2027-02-26'], type: 'quiz' },
 { key: 'problem set 2', due: '2027-03-05', type: 'asg' },
 { key: 'quiz 4', due: ['2027-03-22', '2027-03-26'], type: 'quiz' },
]},
{ name: '04 UW schedule "Week 3 (Jan 18-22) | Topic | Quiz 1"', text:
`Week 3 (Jan 18-22) | Recursion | Quiz 1
Week 4 (Jan 25-29) | Lists | Lab 2
Week 5 (Feb 1-5) | Sorting | Assignment 2 due Friday
Week 6 (Feb 8-12) | Midterm review | Midterm Thursday Feb 11, 7pm
Week 10 (Mar 15-19) | Graphs | Project milestone 2 due Mar 17`,
expect: [
 { key: 'quiz 1', due: ['2027-01-18', '2027-01-22'], type: 'quiz' },
 { key: 'lab 2', due: ['2027-01-25', '2027-01-29'], type: 'project' },
 { key: 'assignment 2', due: '2027-02-05', type: 'asg' },
 { key: 'midterm', due: '2027-02-11', type: 'exam', time: '19:00' },
 { key: 'milestone 2', due: '2027-03-17', type: 'project' },
]},
{ name: '05 Conestoga evaluation table, DD/MM/YYYY incl. ambiguous 03/02/2027', text:
`Evaluation | Weighting | Week/Date
Quiz 1 | 5% | Week 3 – 21/01/2027
Lab Assignment 1 | 10% | Week 4 – 28/01/2027
Lab Assignment 2 | 10% | Week 5 – 03/02/2027
Midterm Test | 20% | Week 6 – 11/02/2027
Lab Assignment 3 | 10% | Week 10 – 10/03/2027
Final Project | 25% | Week 13 – 01/04/2027
Final Exam | 20% | Week 14 – TBD`,
expect: [
 { key: 'quiz 1', due: '2027-01-21', type: 'quiz', weight: 5 },
 { key: 'lab assignment 1', due: '2027-01-28', type: 'project', weight: 10 },
 { key: 'lab assignment 2', due: '2027-02-03', type: 'project', weight: 10 },
 { key: 'midterm', due: '2027-02-11', type: 'exam', weight: 20 },
 { key: 'lab assignment 3', due: '2027-03-10', type: 'project', weight: 10 },
 { key: 'final project', due: '2027-04-01', type: 'project', weight: 25 },
 { key: 'final exam', due: ['2027-04-05', '2027-04-09'], type: 'exam', weight: 20 },
]},
{ name: '06 "4 quizzes, 10% each" and "Weeks 3, 5, 9, 11"', text:
`Quizzes (4, 10% each): Jan 20, Feb 3, Mar 3, Mar 24
Reading Quizzes (3 x 5%) | 15% | Weeks 2, 6, 10`,
expect: [
 { key: 'quiz', due: '2027-01-20', type: 'quiz', weight: 10 },
 { key: 'quiz', due: '2027-02-03', type: 'quiz', weight: 10 },
 { key: 'quiz', due: '2027-03-03', type: 'quiz', weight: 10 },
 { key: 'quiz', due: '2027-03-24', type: 'quiz', weight: 10 },
 { key: 'quiz', due: ['2027-01-11', '2027-01-15'], type: 'quiz', weight: 5 },
 { key: 'quiz', due: ['2027-02-08', '2027-02-12'], type: 'quiz', weight: 5 },
 { key: 'quiz', due: ['2027-03-15', '2027-03-19'], type: 'quiz', weight: 5 },
]},
{ name: '07 policy lines: late penalty, drop deadline, reading week, exam period (expect none)', text:
`Late Policy: Assignments submitted late will receive a late penalty of 10% per day, up to 3 days.
The last day to drop a course with no academic penalty is Jan 15, 2027 (drop deadline).
Drop deadline (WD): March 12
Reading Week: Feb 16-20 – no classes
Family Day (Feb 15): University closed
Assignments submitted after April 2 will not be accepted.
No assignment will be accepted after the last day of classes (April 6).
The final exam period runs April 12-27; do not make travel plans before April 27.
Missed midterm? Submit a Verification of Illness Form within 48 hours, by Mar 1 at the latest for the Feb 24 test.
Remember to check LEARN for announcements before Jan 11.
Course outline last updated Dec 14, 2026.`,
expect: [] },
{ name: '08 Laurier MyLearningSpace prose: "Feb. 3", "p.m.", TBA, exam period', text:
`Online Discussion Posts (5 x 2%): due Sundays by 11:59 p.m. on MyLearningSpace
Reflection Paper 1 (15%) – due Feb. 3 by 11:59 p.m.
Reflection Paper 2 (15%) – due Mar. 10
Group Presentation (20%) – Weeks 10–12, schedule TBA
Research Essay (30%) – due Monday, April 5th, 2027 at 9:00 a.m.
Final Exam (20%) – Scheduled by the Registrar during the April exam period`,
expect: [
 { key: 'discussion', due: null, type: 'read' },
 { key: 'reflection paper 1', due: '2027-02-03', type: 'paper', weight: 15, time: '23:59' },
 { key: 'reflection paper 2', due: '2027-03-10', type: 'paper', weight: 15 },
 { key: 'presentation', due: null, type: 'pres', weight: 20 },
 { key: 'research essay', due: '2027-04-05', type: 'paper', weight: 30, time: '09:00' },
 { key: 'final exam', due: null, type: 'exam', weight: 20 },
]},
{ name: '09 pdf.js-flattened stacked cells (title / weight / date on separate lines)', text:
`Assignment 1
10%
January 29, 2027
Assignment 2
10%
February 26, 2027
Term Test
30%
March 10, 2027
Midterm Exam
Thursday, February 25
6:30 – 8:30 pm, location TBA`,
expect: [
 { key: 'assignment 1', due: '2027-01-29', type: 'asg', weight: 10 },
 { key: 'assignment 2', due: '2027-02-26', type: 'asg', weight: 10 },
 { key: 'term test', due: '2027-03-10', type: 'exam', weight: 30 },
 { key: 'midterm', due: '2027-02-25', type: 'exam', time: '18:30' },
]},
{ name: '10 date ranges / submission windows', text:
`Take-home Midterm: available Feb 24 – Feb 26 (due Feb 26 at 5 pm)
Case Study 2 submission window: March 15–19
Quiz 3 | Mar 8 - Mar 12 | 5% (open on LEARN for 5 days)
Final exam: April 14 - 26 (date TBA)`,
expect: [
 { key: 'midterm', due: '2027-02-26', type: 'exam', time: '17:00' },
 { key: 'case study 2', due: '2027-03-19', type: 'paper' },
 { key: 'quiz 3', due: '2027-03-12', type: 'quiz', weight: 5 },
 { key: 'final exam', due: null, type: 'exam' },
]},
{ name: '11 "released ... due", noon, midnight, ISO with ET', text:
`HW1 released Mon Jan 11, due Thurs., Jan. 21 at 23:59
HW2 due Thu Feb 4 at noon
HW3: due by midnight on Feb. 25
Problem Set 4 — due 2027-03-18 (11:59pm ET)`,
expect: [
 { key: 'hw1', due: '2027-01-21', type: 'asg', time: '23:59' },
 { key: 'hw2', due: '2027-02-04', type: 'asg', time: '12:00' },
 { key: 'hw3', due: '2027-02-25', type: 'asg', time: '23:59' },
 { key: 'problem set 4', due: '2027-03-18', type: 'asg', time: '23:59' },
]},
{ name: '12 UW CS Crowdmark table: A0-A4, "Midterm | Thu Feb 25, 7–9 pm", Final TBA', text:
`Assignments are submitted through Crowdmark. Due dates are listed below and on LEARN.
A0 | Jan 13 | 0%
A1 | Jan 27 | 8%
A2 | Feb 10 | 8%
A3 | Mar 3 | 8%
A4 | Mar 17 | 8%
Midterm | Thu Feb 25, 7–9 pm | 25%
Final | TBA | 35%`,
expect: [
 { key: 'a0', due: '2027-01-13', type: 'asg', weight: 0 },
 { key: 'a1', due: '2027-01-27', type: 'asg', weight: 8 },
 { key: 'a2', due: '2027-02-10', type: 'asg', weight: 8 },
 { key: 'a3', due: '2027-03-03', type: 'asg', weight: 8 },
 { key: 'a4', due: '2027-03-17', type: 'asg', weight: 8 },
 { key: 'midterm', due: '2027-02-25', type: 'exam', weight: 25, time: '19:00' },
 { key: 'final', due: null, type: 'exam', weight: 35 },
]},
{ name: '13 deadlines mentioning lecture / tutorial / break (SKIP words)', text:
`Assignment 3 is due Mar 12 at the start of lecture.
Reading Response 4 due Mar 1 (submit before lecture)
Assignment 2 due the Monday after the break (Feb 22)
Homework 5 due Apr 1 in tutorial
Lab 6 is due the Friday after Reading Week (Feb. 26)
Worksheet 3 due Jan 29 – bring a printed copy to lecture`,
expect: [
 { key: 'assignment 3', due: '2027-03-12', type: 'asg' },
 { key: 'reading response 4', due: '2027-03-01', type: 'read' },
 { key: 'assignment 2', due: '2027-02-22', type: 'asg' },
 { key: 'homework 5', due: '2027-04-01', type: 'asg' },
 { key: 'lab 6', due: '2027-02-26', type: 'project' },
 { key: 'worksheet 3', due: '2027-01-29', type: 'read' },
]},
{ name: '14 Conestoga eConestoga: Week-relative + "Midterm: Week 7 (in lab)"', text:
`Test 1 (Week 5) – covers Modules 1-4 | 15%
Midterm: Week 7 (in lab)
Assignment 2 – due end of Week 8, Sunday 11:59 PM on eConestoga | 10%
Project Proposal | 5% | Week 4
Final Project Demo | 20% | Week 12, in lab
Practical Exam | Week 14 | 25%
Peer evaluation | 5% | TBD`,
expect: [
 { key: 'test 1', due: ['2027-02-01', '2027-02-05'], type: 'exam', weight: 15 },
 { key: 'midterm', due: ['2027-02-15', '2027-02-19'], type: 'exam' },
 { key: 'assignment 2', due: '2027-02-28', type: 'asg', weight: 10, time: '23:59' },
 { key: 'proposal', due: ['2027-01-25', '2027-01-29'], type: 'paper', weight: 5 },
 { key: 'demo', due: ['2027-03-22', '2027-03-26'], type: 'pres', weight: 20 },
 { key: 'practical exam', due: ['2027-04-05', '2027-04-09'], type: 'exam', weight: 25 },
 { key: 'peer evaluation', due: null, weight: 5 },
]},
{ name: '15 deadline sentence wrapped across PDF lines', text:
`The first essay (worth 20% of your final grade) is due on Friday,
January 29 at 11:59 pm via the Quercus/LEARN dropbox.
The annotated bibliography is due
February 12.
Your final research paper (35%) must be submitted no later than
March 26, 2027.`,
expect: [
 { key: 'essay', due: '2027-01-29', type: 'paper', weight: 20, time: '23:59' },
 { key: 'bibliography', due: '2027-02-12' },
 { key: 'research paper', due: '2027-03-26', type: 'paper', weight: 35 },
]},
];
