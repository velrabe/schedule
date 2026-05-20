# schedule

Personal life-logging tracker.

```
Chat (web) → Gemini 2.5 Flash → Supabase Postgres → Dashboard
                ↑
       confirm before write
```

- **Frontend**: Vite + Preact, deployed to GitHub Pages on a custom domain.
- **Backend**: Supabase Edge Functions (Deno).
- **Database**: Supabase Postgres.
- **LLM**: Gemini 2.5 Flash (free tier covers personal use).
- **Auth**: one shared password → HS256 JWT without expiry, stored in localStorage.

---

## Layout

```
schedule/
├── apps/
│   └── web/                # Vite + Preact frontend → GitHub Pages
├── supabase/
│   ├── migrations/         # SQL schema (initial: 0001_init.sql)
│   ├── functions/
│   │   ├── auth/           # POST /auth/login → JWT
│   │   ├── chat/           # POST /chat → calls Gemini, returns proposed actions
│   │   ├── confirm/        # POST /confirm → writes confirmed actions to DB
│   │   └── _shared/        # jwt, gemini, db, rules, cors helpers
│   └── config.toml
├── rules/                  # Markdown rulesets per domain (future: bundled into functions)
└── .github/workflows/
    ├── deploy-frontend.yml   # build apps/web → GH Pages
    └── deploy-functions.yml  # push migrations + deploy edge functions
```

---

## Setup checklist

### 1. Supabase project (one-time, in the browser)

1. Go to <https://supabase.com> and create a new project.
2. Save:
   - **Project Reference** (looks like `abcdefghijklmnop`) — found in `Project Settings → General`.
   - **Project URL** (`https://<ref>.supabase.co`).
   - **anon key** (public) — `Project Settings → API → anon public`.
   - **service_role key** (secret) — `Project Settings → API → service_role`. Never put in the frontend.
   - **Database password** — set when creating the project.
3. Wait a couple of minutes until the project is ready.

### 2. Get a Gemini API key

1. Go to <https://aistudio.google.com/app/apikey> and create a new key.
2. Save the key — you'll paste it as `GEMINI_API_KEY` below.

### 3. Generate a JWT secret and pick an app password

```bash
openssl rand -hex 32   # JWT_SECRET — copy the output
```

Pick any strong-ish password — it will be your single password to enter the app.

### 4. Edge Function secrets (Supabase Dashboard)

Go to `Project Settings → Edge Functions → Environment variables` and add:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | from step 2 |
| `GEMINI_MODEL` | optional, default `gemini-2.0-flash-lite` — see below |
| `APP_PASSWORD` | your shared password |
| `JWT_SECRET` | output of `openssl rand -hex 32` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase into every Edge Function — you don't need to set them manually.

### 5. GitHub repo secrets (for CI deploy)

Settings of the GitHub repo → `Secrets and variables → Actions → New repository secret`:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key from step 1 |
| `VITE_FUNCTIONS_URL` | `https://<ref>.functions.supabase.co` |
| `VITE_BASE_PATH` | `/` for custom domain, or `/<repo-name>/` for `<user>.github.io/<repo>/` |
| `SUPABASE_ACCESS_TOKEN` | personal token from <https://supabase.com/dashboard/account/tokens> |
| `SUPABASE_PROJECT_REF` | project ref from step 1 |
| `SUPABASE_DB_PASSWORD` | database password from step 1 |

### 6. Local dev `.env`

Create `apps/web/.env.local` (gitignored):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
VITE_FUNCTIONS_URL=https://<ref>.functions.supabase.co
```

### 7. Install deps and run locally

```bash
npm install
npm run dev          # → http://127.0.0.1:5173
```

To run edge functions locally (optional, requires Docker + Supabase CLI):

```bash
brew install supabase/tap/supabase
supabase start
supabase functions serve --no-verify-jwt
```

Then set `VITE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1` in `.env.local`.

### 8. Push migrations + functions once

After linking your CLI to the project:

```bash
supabase login
supabase link --project-ref <ref>
supabase db push                       # applies migrations/0001_init.sql
supabase functions deploy auth --no-verify-jwt
supabase functions deploy chat --no-verify-jwt
supabase functions deploy confirm --no-verify-jwt
```

(After this, the GitHub Action `deploy-functions.yml` will keep them in sync on every push to `main`.)

### 9. Enable GitHub Pages

Repo `Settings → Pages → Source: GitHub Actions`.

If using a custom domain:

1. Add a `CNAME` file in `apps/web/public/` containing your domain.
2. Configure DNS:
   - For apex domain (`example.com`): A records to `185.199.108.153`, `…109.153`, `…110.153`, `…111.153`.
   - For subdomain (`schedule.example.com`): CNAME to `<your-user>.github.io`.
3. In `Settings → Pages` set the custom domain.

---

## Gemini models (chat / log / images)

Chat supports **text + screenshots** (`image_base64` in `/chat`). The UI compresses images before upload.

| Model | When to use |
|---|---|
| `gemini-2.0-flash-lite` | **Default for text only.** Lowest quota use. |
| `gemini-2.0-flash` | **Default when a photo is attached** (auto if `GEMINI_MODEL` unset). Better for receipts, macros, schedules. |
| `gemini-2.5-flash` | Smarter but burns free quota faster — avoid for heavy daily use. |

Set explicitly: Supabase → Edge Functions → Secrets → `GEMINI_MODEL=gemini-2.0-flash` → redeploy `chat`.

### Free tier reality (2026)

There is **no** reliable “unlimited free” vision API for production. All hosted options cap RPM/RPD per key:

| Provider | Vision | Typical free limit | Notes |
|---|---|---|---|
| **Google Gemini** | yes | ~15 RPM, low RPD on free | Best fit for this app (JSON + images). Enable **billing** in [AI Studio](https://aistudio.google.com/) — personal use is usually **cents/month**, quota jumps sharply. |
| **Groq** | limited models | high text RPM | Great for text-only; vision models change often, no structured JSON guarantee. |
| **OpenRouter** | some free routes | ~50 req/day free | Good for experiments, not daily driver. |
| **Local Ollama** (Qwen2-VL, LLaVA) | yes | unlimited on your GPU | Zero API quota; you host and wire yourself. |

**Practical advice:** keep `GEMINI_API_KEY`, use `gemini-2.0-flash-lite` for text, let the app auto-pick `gemini-2.0-flash` for images, and **turn on billing** on the Google Cloud project if you hit 429 after ~10 minutes of active testing.

---

## How auth works

- `POST /auth/login { password }` → compares against `APP_PASSWORD`. If match, returns `{ token }` (HS256 JWT, no expiry, signed with `JWT_SECRET`).
- Frontend saves `token` in `localStorage` under `schedule:auth-token`.
- All subsequent `fetch` to edge functions include `Authorization: Bearer <token>`.
- Each protected edge function (`chat`, `confirm`) calls `requireAuth()` which verifies the token.
- "Logout" = clear localStorage (token can't be revoked server-side because there's no session table; this is intentional simplicity for a one-user app).

## How chat works

1. You type a message and/or attach a screenshot (📷 button or paste).
2. Frontend `POST /chat { message, image_base64?, image_mime? }`.
3. Edge function:
   - Saves the raw message to `raw_logs` (status=pending).
   - Builds context: open work sessions, today's day row, today's sessions.
   - Calls Gemini 2.5 Flash with rules + tools schema + your message.
   - Gemini returns structured JSON: `{ reply_to_user, actions[], needs_confirmation }`.
   - Updates `raw_logs.parsed_json`.
   - Returns to frontend.
4. Frontend shows the reply + an action preview + ✓/✗ buttons.
5. On ✓: `POST /confirm { raw_log_id, decision: "confirm" }` → backend writes typed rows to `sessions/meals/...` and marks the raw log as `saved`.

## How the dashboard works

The existing dashboard from before the rebuild now lives at `apps/web/src/dashboard/`. It currently reads from seed data (`seed.js`). Wiring it to Supabase is the next step.

---

## Tasks for you (Vel)

- [ ] Create Supabase project, save secrets.
- [ ] Add `GEMINI_API_KEY`, `APP_PASSWORD`, `JWT_SECRET` in Supabase Edge Function env.
- [ ] Push migrations: `supabase db push`.
- [ ] Deploy functions: `supabase functions deploy auth chat confirm --no-verify-jwt`.
- [ ] Add GH Actions secrets (`VITE_*`, `SUPABASE_*`).
- [ ] Tell me your custom domain and I'll wire the CNAME.
- [ ] Confirm repo name + I push to GitHub.

After that, the auth + chat MVP will be live. Dashboard data wiring is the next phase.
