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

`.env` is server-only and ignored by Git. The server supports `GEMINI_API_KEY`, `XAI_API_KEY` (Grok), and `OPENAI_API_KEY`; keys are never sent to the browser. With `AI_PROVIDER=auto`, it selects Gemini, then Grok, then OpenAI based on configured keys. To use Grok while Gemini is also configured, set:

```env
AI_PROVIDER=grok
XAI_API_KEY=your-xai-api-key
XAI_MODEL=grok-4.7
XAI_QUICK_MODEL=grok-4.7
```

Restart `npm run dev:ai` after changing `.env`. Live voice and natural speech still use `OPENAI_API_KEY`; Grok is currently wired for text chat and structured AI tasks.

For production, add the same variables under the Vercel project's Environment Variables, then redeploy. Never commit `.env` or put provider keys in `src/`.

## How it is organised

| Folder | What |
| --- | --- |
| `src/screens` | Every page: Landing, SignIn, Dashboard, Communities, IdeaPage, Queue, Promote, Analytics, Settings, Database, Access, Me |
| `src/bot` | QuorlythBot: sidebar chats, right click menu, skills, projects, library, voice studio, live voice, 3D robot |
| `src/data` | One tiny document store. `local.ts` works with no setup. `supabase.ts` gives real accounts and a shared database |
| `server` | Server-only Gemini/Grok/OpenAI calls: streaming chat, JSON answers, live voice session, natural speech |
| `api` | The same server code as Vercel functions for deploying |
| `supabase/schema.sql` | Tables and access rules for Supabase |

## Real accounts (Google, email) and a shared database

1. Create a project at supabase.com, run `supabase/schema.sql` in the SQL editor.
2. Enable Email/password and Google under Authentication, Providers. Allow your local and deployed app URLs in the redirect URL settings.
3. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` and restart `npm run dev`.

## Deploy

Push to GitHub, import it in Vercel, add `AI_PROVIDER` and your selected provider key (`GEMINI_API_KEY`, `XAI_API_KEY`, or `OPENAI_API_KEY`) plus Supabase keys under Environment Variables, then deploy.
