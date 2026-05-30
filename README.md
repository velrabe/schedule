# schedule

Personal life-logging tracker: schedule, nutrition, finance, events.

```
UI (GitHub Pages) ──read/write──► Supabase Edge Functions ──► Postgres
                                        ▲
Codex / scripts ──/manual, /agent, /data──┘
Chat UI (optional) ──/chat (Gemini)──► /confirm
```

> **Codex / Cursor agents:** read **[AGENTS.md](./AGENTS.md)** first. Day-to-day data → API, not SQL migrations.

- **Frontend**: Vite + Preact → [velrabe.github.io/schedule](https://velrabe.github.io/schedule)
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase Postgres (migrations in `supabase/migrations/`)
- **Auth**: shared password → HS256 JWT (`APP_PASSWORD` + `JWT_SECRET`)
- **Optional LLM**: Gemini in `/chat` (UI); agents use `/agent` without Gemini

---

## Layout

```
schedule/
├── AGENTS.md               # Codex/Cursor: API, запреты, workflow
├── apps/web/               # Dashboard + optional chat FAB
├── scripts/
│   └── schedule-api.mjs    # CLI: login, get, manual, apply
├── supabase/
│   ├── migrations/         # Schema + rare bulk imports (0012 latest schedule)
│   └── functions/
│       ├── auth/           # POST /auth/login
│       ├── data/           # POST /data (read)
│       ├── manual/         # POST /manual (CRUD row)
│       ├── agent/          # POST /agent (batch actions)
│       ├── chat/           # POST /chat (Gemini)
│       ├── confirm/        # POST /confirm
│       └── _shared/        # rules.ts, applyActions, sync helpers
├── rules/README.md         # Points to rules.ts (no .md rules yet)
└── .github/workflows/      # deploy-frontend + deploy supabase
```

---

## Setup (one-time)

### Supabase

1. Create project at <https://supabase.com> — save **Project ref**, **URL**, **anon key**, **DB password**.
2. Edge Function secrets (`Project Settings → Edge Functions`):

| Name | Value |
|------|--------|
| `GEMINI_API_KEY` | optional if not using chat |
| `GEMINI_MODEL` | optional, see below |
| `APP_PASSWORD` | app + Codex CLI password |
| `AGENT_API_KEY` | optional: `openssl rand -hex 32` — only for Codex (`SCHEDULE_API_KEY` in CLI) |
| `JWT_SECRET` | `openssl rand -hex 32` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### GitHub Actions secrets

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`, `VITE_BASE_PATH` (`/schedule/` for project pages), `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`

### Local dev

`apps/web/.env.local`:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FUNCTIONS_URL=https://<ref>.functions.supabase.co
```

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Codex CLI (repo root): see `.env.example` for `SCHEDULE_FUNCTIONS_URL` + `SCHEDULE_PASSWORD`.

### Migrations + functions (first time)

```bash
supabase login
supabase link --project-ref <ref>
supabase db push
supabase functions deploy auth chat confirm data manual agent --no-verify-jwt
```

Further pushes to `main` deploy via CI.

---

## Writing data (Codex)

**Do not** edit production data via new migrations unless the user explicitly asks.

```bash
npm run api -- login
npm run api -- get sessions --from 2026-05-29 --to 2026-05-31
npm run api -- apply my-plan.json
```

Full contract: **[AGENTS.md](./AGENTS.md)**. Business rules: **`supabase/functions/_shared/rules.ts`**.

---

## Auth

- `POST /auth/login { password }` → JWT (no expiry), stored in `localStorage` as `schedule:auth-token` in the UI.
- Protected: `data`, `manual`, `agent`, `chat`, `confirm` — header `Authorization: Bearer <token>`.

---

## Optional: Gemini chat (UI)

1. `POST /chat` → proposed `actions[]` in `raw_logs`.
2. User confirms → `POST /confirm`.

Models: prefer `gemini-2.0-flash-lite` (text) / `gemini-2.0-flash` (images). See comments in old commits or AI Studio for quota notes.

---

## Dashboard

`apps/web/src/dashboard/ScheduleTracker.jsx` loads live data via `useSupabaseSnapshot()` → `POST /data` (days, sessions, meals, finance, …). Manual edits in UI use `POST /manual`. Local `seed.js` is legacy/offline only when `liveData` is absent.

---

## Accounts (current)

| id | Label |
|----|--------|
| `savings_rub` | Savings RUB |
| `ip_rub` | Business RUB |
| `vcb_vnd` | Bank VND |
| `cash_vnd` | Наличные |

`loco_rub` was removed (merged into `ip_rub`).
