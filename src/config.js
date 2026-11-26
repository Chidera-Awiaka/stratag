// Supabase "anon public" key is designed to be public; Row Level Security protects the data.
// Set these in Vercel env vars, or paste them here.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Product name lives here only, so a rename is one line.
export const APP_NAME = 'StratAG';
export const TAGLINE = 'your straight-A G';
export const MAKER = 'Ikiloop';
