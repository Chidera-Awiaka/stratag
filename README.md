# StratAG · your straight-A G

Drop in a syllabus (PDF or pasted text). Every quiz, lab, essay and exam becomes small dated steps,
a week-by-week plan, a grade tracker that says what you need on the rest, and an .ics file for
Google / Apple / Outlook calendar. Made by Ikiloop.

The name is set in one place: `src/config.js` (`APP_NAME`, `TAGLINE`).

## Run it
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser tests
npm run build    # static site in dist/
```

## How it works
- **Parsing** (`src/lib/parse.js`): rules, no AI, runs in the browser. Reads "Jan 20", "20 January 2027",
  "2027-01-20", "1/20", "20/01/2027", "Week 5 Wed" (from the term's first Monday), times and weights.
  Skips holidays, office hours and schedule rows that aren't work. The student reviews and fixes rows before planning.
- **PDFs** (`src/lib/pdf.js`): pdf.js in the browser rebuilds table rows. The file never leaves the device.
  Scanned (image) PDFs aren't supported yet.
- **Steps**: each type has a lead-time recipe (essay starts 14 days out, quiz 3). Steps are anchored to the day
  you planned, and squeezed into the time left when a deadline is close.
- **Grades**: enter marks per weighted item; shows your mark so far, what average you need on what's left
  for a target, and your biggest gap.
- **Storage and sync** (`src/lib/store.js`): local-first in localStorage. With Supabase configured, email
  magic-link sign-in syncs one JSON plan per user (per-record last-edit-wins merge, so phone and laptop both work offline).

## Turn on accounts and sync (Supabase, free)
1. Create a project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → URL Configuration: set Site URL to your live URL (and add `http://localhost:5173` to Redirect URLs).
4. Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Vercel → Project → Settings → Environment Variables, or `.env.local`).

## Deploy (Vercel, free)
Import the GitHub repo at vercel.com/new. Framework preset: Vite. No other settings needed.

## Roadmap
- Grades: "where can I do better" trends across courses, GPA view.
- Live calendar subscription (auto-updating feed instead of a one-time .ics).
- Optional AI pass for messy syllabi (paid tier).
- Brightspace / D2L (LEARN, eConestoga, MyLearningSpace) import.
- Reminders (email / push) the day before a step.
