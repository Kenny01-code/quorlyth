# Quorlyth (React)

React + Vite + TypeScript version of the Quorlyth site. Every page from the single file version is here.

## Run it (Windows PowerShell)

```powershell
cd path\to\quorlyth
npm install
npm run dev:ai     # window 1: the small AI server (reads .env)
npm run dev        # window 2: the website  ->  http://localhost:5173
code .
```

Node 20.6 or newer is needed (`node -v`).

## Keys

`.env` can hold `OPENAI_API_KEY` and/or `GEMINI_API_KEY`. The server reads these keys; they are never sent to the browser. When both are configured, Gemini handles bot chat and JSON skills, while OpenAI remains available for live voice and natural speech. `.env` is in `.gitignore`.
For production, add keys to the Vercel project's Environment Variables and redeploy. Never commit `.env` or put provider keys in `src/`.

## How it is organised

| Folder | What |
| --- | --- |
| `src/screens` | Every page: Landing, SignIn, Dashboard, Communities, IdeaPage, Queue, Promote, Analytics, Settings, Database, Access, Me |
| `src/bot` | QuorlythBot: sidebar chats, right click menu, skills, projects, library, voice studio, live voice, 3D robot |
| `src/data` | One tiny document store. `local.ts` works with no setup. `supabase.ts` gives real accounts and a shared database |
| `server` | Server-only Gemini/OpenAI calls: streaming chat, JSON answers, live voice session, natural speech |
| `api` | The same server code as Vercel functions for deploying |
| `supabase/schema.sql` | Tables and access rules for Supabase |

## Real accounts (Google, email) and a shared database

1. Create a project at supabase.com, run `supabase/schema.sql` in the SQL editor.
2. Enable Email/password and Google under Authentication, Providers. Allow your local and deployed app URLs in the redirect URL settings.
3. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` and restart `npm run dev`.

## Deploy

Push to GitHub, import it in Vercel, add `GEMINI_API_KEY` or `OPENAI_API_KEY` (and the Supabase keys) under Environment Variables, deploy.
