# StratAG roadmap

**Rule for now: zero running cost.** Everything ships on free tiers (Vercel Hobby, Supabase Free) with no paid APIs. Ideas that cost money wait below until there's capital.

## Shipped, free
- Rule-based syllabus reader (PDF, photo OCR in the browser, paste), weekly steps, Today view, grades tracker, .ics export
- Sync across devices (Supabase free tier, magic link)
- LEARN / MyLearningSpace / eConestoga calendar import
- In-app feedback: check-in card after 3 days of real use (then every 3 weeks), plus "Send feedback" link
- Private feedback dashboard at `/admin`: rule-based themes, search, mark handled, CSV export

## When we have capital
- **"Your G" AI helper** (Claude API, small fast model, roughly a cent or two per student per week): chat that knows your plan, "what should I do tonight", study tips per assessment
- **AI syllabus reading** as a fallback when the rules miss rows (messy tables, scanned outlines)
- **AI feedback themes**: summarize dashboard feedback into top asks each week
- Branded sign-in emails from a dedicated sender (custom SMTP) and a Sunday recap email
- Self-updating calendar subscription (needs a small server job)
- Custom domain
