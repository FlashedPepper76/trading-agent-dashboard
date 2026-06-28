# Agent Log

A small dashboard for the [paper trading agent](https://github.com/FlashedPepper76/Paper-trading-agent):

- **LOG** — every run the agent has made, in order, with its overall reasoning and a per-symbol
  breakdown (action, quantity, confidence, reasoning, and what actually happened with the order).
- **AGENT BRIEF** — the agent's standing instructions/system prompt. Edits here take effect on the
  next scheduled run automatically — no redeploy, no code change. This is the practical way to
  "talk to" the agent: it reads this file fresh every run.

Reads and writes go straight to Supabase (the same `life-dashboard` project the trading agent logs
to) using the public anon key — row-level security on the tables controls what's allowed, the key
itself isn't a secret.

## Environment variables (set in Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_KEY` — the Supabase publishable/anon key, not the service role key

## Local development

```
npm install
npm run dev
```

Create a `.env.local` with the two variables above to run locally.
