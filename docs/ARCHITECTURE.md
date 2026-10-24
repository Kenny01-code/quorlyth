# Quorlyth architecture

Quorlyth is an operating system for fanbases: it turns scattered audience activity into an organized, explainable path from ideas to real work.

## 1. Product workflow

```mermaid
flowchart LR
  F[Followers / audience members] --> C[Interest-based communities]
  C --> I[Ideas, comments and votes]
  I --> COL[Collaboration requests]
  I --> AI[AI summary, relevance and opportunity signals]
  COL --> Q[Creator review queue]
  AI --> Q
  Q --> D{Creator decision}
  D -->|Select| P[Project and milestones]
  D -->|Hold| H[Keep visible for later]
  D -->|Decline| N[Status and outcome remain visible]
  P --> PR[Promotion draft with contributor credit]
  PR --> W[Share with wider audience]
```

This is the main challenge journey: **Followers → Organized Communities → Ideas → Collaboration → Action**. AI helps prioritize real activity, but the creator makes the decision. A promotion is a draft until an external publishing integration confirms publication.

## 2. Technical architecture

```mermaid
flowchart TB
  subgraph Client["Web client"]
    UI[React + TypeScript screens]
    APP[AppProvider and data adapters]
    BOT[QuorlythBot chat, voice and context]
    AUTO[Automation Studio and event runtime]
    UI --> APP
    UI --> BOT
    UI --> AUTO
  end

  AUTH[Supabase Auth]
  DB[(Supabase Postgres)]
  RLS[Row-level security and ownership policies]
  UI --> AUTH
  APP <--> DB
  DB --- RLS

  subgraph API["Server-side API boundary"]
    ROUTES[Vercel /api routes]
    HANDLERS[server/openai.mjs and bot-context]
    ROUTES --> HANDLERS
  end
  BOT -->|same-origin /api requests| ROUTES
  HANDLERS -->|authenticated context| AUTH
  HANDLERS --> AI[Configured AI providers]
  HANDLERS --> TTS[ElevenLabs-first speech pipeline]
  HANDLERS -. optional evidence .-> YT[YouTube Data API]

  RAIL[Railway Node AI service<br/>server/railway-server.mjs]
  RAIL -. optional direct API path<br/>when VITE_AI_API_BASE_URL is configured .-> BOT

  AUTO -->|while a Quorlyth session is active| EVENTS[Idea, workspace and task events]
  EVENTS --> RULES[Trigger → condition → action]
  RULES --> ACT[In-app notification / create task / HTTPS webhook]
  ACT --> DB
```

### Responsibilities by layer

- **React + TypeScript:** the dashboard, communities, idea pages, review queue, projects, milestones, promotion drafts, profiles, QuorlythBot, and automation UI.
- **AppProvider/data adapters:** loads the current user's data, exposes product actions, and coordinates production data versus demo behavior.
- **Supabase:** authentication and shared app records. Database row-level security and server-side ownership checks are the security boundary for private records.
- **Vercel API routes:** same-origin server-side endpoints for chat, structured AI tasks, realtime-session setup, speech and provider fallback. Provider keys stay on the server. With the current production configuration, `VITE_AI_API_BASE_URL` is blank, so the browser uses the same-origin `/api` routes.
- **AI and voice:** the server ranks/summarizes actual idea and collaboration context; ElevenLabs is preferred for generated speech, with configured provider/browser fallback where available. Optional YouTube signals enrich idea review only when the API is configured and returns usable evidence.
- **Railway AI service:** the Node service is deployed and can serve the same handler family. It is an optional direct path, not the default browser path while `VITE_AI_API_BASE_URL` remains blank.
- **Workflow automations:** user-owned workflow definitions connect triggers to conditions and actions. The current runtime handles product events while a Quorlyth session is active; it is not yet an always-on server worker when every browser is closed.

## 3. Event and automation flow

```mermaid
sequenceDiagram
  participant Member as Community member
  participant App as Quorlyth web app
  participant Data as Supabase
  participant AI as Server-side AI
  participant Creator as Creator
  participant Auto as Automation runtime

  Member->>App: Submit idea / vote / comment
  App->>Data: Save the real activity
  App->>Auto: Emit product event
  App->>AI: Request summary or ranking when needed
  AI-->>App: Explainable result grounded in available data
  App-->>Creator: Show ideas in the review queue
  Creator->>App: Select, hold, or decline
  App->>Data: Persist decision and project changes
  App->>Auto: Emit task/workspace event
  Auto->>Data: Save notification or create task
  Auto-->>App: Show run result and history
```

Automations currently support manual, idea-created, task-completed and workspace-created triggers; notification, task-creation and HTTPS-webhook actions; and a per-step run history. A live browser/session is currently required for event-driven runs. An always-on queue/worker, scheduled triggers, retries and delivery monitoring are a next architecture step—not a current capability.

## 4. Security and reliability rules

1. API/provider credentials stay in Vercel/Railway server environment variables; no secret belongs in a `VITE_*` setting.
2. Supabase policies and authenticated ownership checks protect private creator/member records. CORS is not a substitute for authorization.
3. AI results must be based on available activity and explain their rationale; missing provider quota/credentials should produce an honest failure state, not fabricated metrics.
4. A promotion draft must not be described as externally published without confirmation from an actual publishing integration.
5. Voice preview and chat replies use the same ElevenLabs-first pipeline, while voice playback remains subject to browser media permissions and autoplay rules.

## 5. Next production hardening steps

- Move automation execution to an authenticated server-side queue/worker so workflows continue when the creator closes the browser.
- Add schedules, retries, idempotency keys, webhook signing, delivery logs and per-action secret management.
- Validate the full creator/member journey in production with two separate accounts and confirm refresh persistence and denial behavior against production policies.
- Add explicit provider health checks and end-to-end voice tests against the deployed environment without recording or exposing credentials.
