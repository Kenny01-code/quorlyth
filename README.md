# Quorlyth

**An operating system for fanbases.** Quorlyth helps creators turn a noisy audience into focused communities where people can share ideas, collaborate, and help creators decide what deserves to move forward.

- **Live app:** https://quorlyth.vercel.app
- **Source:** https://github.com/Kenny01-code/quorlyth
- **Assessment brief and acceptance checklist:** [ASSESSMENT.md](./ASSESSMENT.md)

## The problem

Creators receive more messages, ideas, collaboration requests, and opportunities than they can review one by one. Valuable ideas and contributors can get lost in the noise.

Quorlyth organizes that flow:

**Followers → Interest communities → Ideas → Collaboration → AI-assisted surfacing → Creator decisions → Promotion**

## What is in the current codebase

The React application includes routes and screens for the landing page, sign-in, onboarding, dashboard, communities, idea details, creator review queue, promotion preparation, analytics, settings, data administration, access requests, member profiles, and the Quorlyth assistant.

Implemented code paths also cover community creation and membership, idea submission, voting and comments, review statuses, collaboration applications, creator decisions, project/milestone tracking, profile/settings updates, demo mode, and server-side AI endpoints. Availability in the interface is not a guarantee that every workflow has been verified end-to-end in production; see the assessment checklist for the validation still required.

## Tech stack

- React 18, TypeScript, Vite, React Router
- Supabase Auth and shared data storage (optional dependency)
- Server-side Node.js AI handlers for Gemini, Grok, and OpenAI
- Vercel deployment configuration
- Node's built-in test runner

## Repository map

```text
.
├── api/                    # Vercel function entry points for AI routes
├── public/                 # Static public assets
├── scripts/                # Project scripts
├── server/                 # Server-only AI handlers and tests
├── src/
│   ├── ai/                 # AI client/integration helpers
│   ├── bot/                # Quorlyth assistant and voice/workspace UI
│   ├── components/         # Shared UI and navigation components
│   ├── data/               # App provider, local/demo data, Supabase adapter
│   ├── lib/                # Types, utilities, notifications and app helpers
│   ├── screens/             # Route-level screens
│   └── styles/              # Application styles
├── supabase/
│   ├── migrations/          # Incremental database policy/schema changes
│   ├── schema.sql           # Base schema/setup reference
│   └── owner-email-migration.sql
├── index.html
├── package.json
├── vite.config.ts
└── vercel.json
```

## Run locally

Use Node.js 20.6 or newer. In Windows PowerShell, from the repository root:

```powershell
npm install
```

For the web app:

```powershell
npm run dev
```

For local AI routes, open a second terminal and run:

```powershell
npm run dev:ai
```

Vite runs at http://localhost:5173. The development AI server reads server-side environment variables from `.env`.

## Environment variables

Start with the names in [`.env.example`](./.env.example). Common AI settings are:

- `AI_PROVIDER` — `auto`, `gemini`, `grok`, or `openai`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `OPENAI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Provider keys must remain server-side. Do not commit `.env`, paste API keys into source files, or expose secret keys in browser code. OpenAI is currently used for live voice/natural speech paths; check the implementation and provider availability before assuming every modality is supported by every provider.

## Supabase setup

1. Create a Supabase project.
2. Review `supabase/schema.sql` and the incremental SQL files under `supabase/migrations/` against your intended database before applying them.
3. Enable the authentication providers you want to support.
4. Set the Supabase URL and public/anon key in your local environment and configure the correct local/deployed redirect URLs in Supabase Auth.
5. Configure equivalent production environment variables in Vercel.

**Production safety:** the base schema is a setup reference, not a substitute for reviewing the current production policies. Apply migrations deliberately and do not blindly re-run broad policy definitions against an existing production database.

## Tests and build

```powershell
npm test
npm run typecheck
npm run build
```

The latest local verification recorded for the reliability/collaboration change set was **6 tests passing** and a successful production build. Bundle-size warnings were reported for some chunks; this is not the same as a live production smoke test. Re-run the commands above against the current checkout before release.

## Deployment

The production domain is https://quorlyth.vercel.app. A successful Vercel build only proves that the built artifact was created; it does not prove authentication, Supabase policies, AI provider keys, or every collaboration flow works in production.

The Vercel project has previously received CLI-based deployments. Confirm the deployment's commit SHA and Git integration before assuming a push to `main` automatically deploys. The intended long-term setup is to connect this project to the GitHub repository and production branch, configure environment variables in Vercel, and verify each production deployment in the Vercel dashboard.

## Project requirements

See [ASSESSMENT.md](./ASSESSMENT.md) for the original problem statement, MVP requirements, user journey, acceptance checklist, and honest verification status.
