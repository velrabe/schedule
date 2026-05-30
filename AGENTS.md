# Codex / Cursor — инструкция для агентов

**Читай этот файл первым.** Репозиторий: личный трекер (расписание, еда, финансы, визаран). Прод: Supabase + GitHub Pages.

## Жёсткие запреты (чтобы не «наворотить говна»)

1. **Не трогай `supabase/migrations/*.sql`** без явной просьбы пользователя. Импорт истории — только по запросу; дневные правки — через API.
2. **Не редактируй уже применённые миграции** — только новый файл `00XX_*.sql`.
3. **Не коммить** `.env`, `.env.local`, `.schedule-token`, ключи Supabase/Gemini.
4. **Не используй `service_role`** во фронте и в скриптах агента — только Edge Functions + JWT.
5. **Не создавай счёт `loco_rub`** — удалён; ИП = `ip_rub` (Business bank).
6. **UUID** — только валидный hex (`[0-9a-f]{8}-...`). Префиксы `s`, `p`, `m` в id **нельзя**.
7. **Не дублируй food**: для приёма пищи → `create_session` с `type=food`, `category=food`; `meals` создаётся на сервере. Отдельный `create_meal` — только если нужны макросы без сессии.
8. **Не удаляй сессии** с привязанным `finance_transactions.session_id` без понимания последствий для балансов.
9. **Не клади** пароли/токены в коммиты; только secrets / `codex.env` (gitignored).

## Что делать вместо миграций и CI

| Задача | Инструмент |
|--------|------------|
| Прочитать день/неделю | `POST /data` или CLI `get` |
| Одна правка (сумма, время) | `POST /manual` |
| День расписания (много блоков) | `POST /agent` с `actions[]` |
| Массовый исторический импорт | SQL-миграция **только по запросу** |

Правила: **`supabase/functions/_shared/rules.ts`** — сначала секция **`data_model`** (связи сущностей), затем домены. JSON `reply_to_user` / `needs_confirmation` — **только для `/chat`**, не для `/agent`.

## Окружение (CLI / Codex)

```bash
node scripts/codex-check.mjs    # диагностика: что видит shell (без секретов)
node scripts/schedule-api.mjs check-env
node scripts/schedule-api.mjs login
node scripts/schedule-api.mjs get sessions --from 2026-05-26 --to 2026-05-29
node scripts/schedule-api.mjs apply plan.json
```

**URL:** `SCHEDULE_FUNCTIONS_URL=https://<PROJECT_REF>.functions.supabase.co`

**Auth — любой один способ:**

| Способ | Где задать | Примечание |
|--------|------------|------------|
| `SCHEDULE_TOKEN` | Codex **Environment variables** | JWT без срока; сгенерируй локально: `login` → `cat .schedule-token` |
| `SCHEDULE_API_KEY` | Codex env + Supabase secret `AGENT_API_KEY` | Отдельный ключ только для агента (`openssl rand -hex 32`) |
| `SCHEDULE_PASSWORD` | Codex env | = `APP_PASSWORD` в Supabase |
| `codex.env` | файл в корне репо | см. `codex.env.example` (в `.gitignore`) |

### Codex: Secrets / Environment variables часто НЕ попадают в shell

Если `printenv | rg SCHEDULE` пусто — **это нормально для Codex**. Рабочие варианты (по надёжности):

1. **Custom Setup script** (лучший): Codex → Environment → Setup script → **Custom** → вставь `scripts/codex-setup.sh`, замени `PASTE_AGENT_API_KEY` на ключ (= Supabase `AGENT_API_KEY`). **Новая сессия** после сохранения.
2. **Файл `agent.api.key`** в корне workspace: одна строка = API key (в `.gitignore`, не коммитить).
3. **`codex.env`** в корне (см. `codex.env.example`).
4. Environment variables в UI Codex — только если после рестарта `codex-check` показывает `set`.

URL подставится сам из `schedule.project.ref`, если `SCHEDULE_FUNCTIONS_URL` не задан.

Первый шаг в задаче: `node scripts/codex-check.mjs` → затем `get` / `apply`.

**Codex + `fetch failed`:** в setup/maintenance добавь `export SCHEDULE_USE_CURL=1` — CLI сам ходит через `curl -4` (или авто-fallback после ошибки fetch).

Локальный фронт: `apps/web/.env.local` — `VITE_FUNCTIONS_URL`, … (см. `.env.example`).

Часовой пояс логов: **Asia/Ho_Chi_Minh** (UTC+7).

## API (все POST, кроме login)

| Endpoint | Auth | Назначение |
|----------|------|------------|
| `/auth/login` | нет | `{ "password" }` или `{ "api_key" }` (если задан `AGENT_API_KEY` на сервере) → `{ "token" }` |
| `/data` | Bearer | чтение таблицы |
| `/manual` | Bearer | CRUD одной строки |
| `/agent` | Bearer | пакет `actions[]` (без Gemini) |
| `/chat` | Bearer | Gemini (UI, можно не использовать) |
| `/confirm` | Bearer | подтверждение после chat |

### `/data` — ресурсы для `get`

`days`, `sessions`, `meals`, `activities`, `substances`, `body_metrics`, `finance_transactions`, `accounts`, `balance_snapshots`, `finance_planned_items`, `events`, `planner_events`, `mood_logs`, `nutrition_goals`, `raw_logs`

Тело: `{ "resource": "sessions", "from": "2026-05-01", "to": "2026-05-31", "limit": 1000 }`

### `/manual` — запись одной строки

`op`: `insert` | `update` | `delete` | `upsert`

`resource`: `days`, `sessions`, `meals`, `activities`, `substances`, `body_metrics`, `finance_transactions`, `events`, `planner_events`, `mood_logs`, `nutrition_goals`, `accounts`, `balance_snapshots`, `finance_planned_items`

Примеры:

```bash
node scripts/schedule-api.mjs manual upsert days '{"date":"2026-05-31","wake_time":"11:00","sleep_time":"02:00","modafinil_mg":50,"day_type":"work"}'

node scripts/schedule-api.mjs manual insert sessions '{"date":"2026-05-31","start_time":"16:00","end_time":"17:00","duration_min":60,"type":"food","category":"food","project":"обед"}'
```

После `food`-сессии сервер создаёт/линкует `meals`. Finance-транзакции обновляют `accounts.balance`.

### `/agent` — пакет действий

Тело: `{ "actions": [ { "type": "...", "data": { ... } } ], "swallow_ok": false }`

Если ответ `409 swallow_required` — перечитай `warnings`, согласуй с пользователем, повтори с `"swallow_ok": true`.

**Типы** (полные правила в `rules.ts` + примеры в `chat/index.ts`):

| type | Назначение |
|------|------------|
| `update_day` | поля строки `days` |
| `create_session` | одна строка в ежедневнике (простой блок) |
| `create_session_bundle` | сессия + несколько `session_events` (такси, зал, перекус) |
| `create_session_event` | один атомарный ивент, опционально `session_id` |
| `update_session` | сдвиг/правка по `id` из `get sessions` |
| `delete_session` | только по явной просьбе |
| `create_work_session_open` / `close_work_session` | открытая работа |
| `create_meal` | макросы (обычно после food-сессии) |
| `create_activity` | спорт (run, cycling, …) |
| `create_finance_transaction` | расход/доход/transfer |
| `create_substance` | мода, кофе, … |
| `create_body_metric` | вес, пульс, … |
| `create_event` | событие (visa, planning, …) |
| `create_planner_event` | календарь |
| `create_mood_log` | настроение |
| `ask_clarification` | **не пишет в БД** — для `/agent` избегай, уточни у пользователя в чате |

Для `/agent` поле `reply_to_user` / `needs_confirmation` **не нужны** — только `actions[]`.

## Счета (`accounts.id`)

| slug | Описание |
|------|----------|
| `savings_rub` | Savings RUB |
| `ip_rub` | Business bank / ИП |
| `vcb_vnd` | Bank VND |
| `cash_vnd` | Наличные |

Перевод: `txn_type=transfer`, `account` (откуда), `counter_account`, `amount` (валюта `account`), `amount_counter` (валюта счёта-получателя).

## Связки (обязательно понимать)

```
days (date PK)
  └── sessions (food → auto meals via session_id)
  └── meals.session_id → sessions.id
  └── finance_transactions.session_id → sessions.id (unique)
  └── activities — параллельно sport-сессиям по времени
events ↔ finance_planned_items (визаран и т.п.)
```

Стабильные id импорта расписания: `521YYxxx-0000-4000-8000-...` (YY = день месяца в коде). Перед правкой дня — **`get sessions` за эту дату**.

## Рекомендуемый workflow Codex

1. `get days`, `get sessions`, `get meals`, `get finance_transactions` за нужный диапазон.
2. Сверь с запросом пользователя; не выдумывай id.
3. Собери `actions.json` или серию `manual`.
4. `apply` → проверь `ok: true`.
5. Повторный `get` для верификации.
6. **Не пушь** без просьбы; **не деплой** — данные уже в Supabase.

## Миграции (только по запросу)

Файлы `0001`…`0012` — история схемы и разовые импорты. Новый импорт: `0013_short_name.sql`, push через CI или `supabase db push`.

## Архитектура (кратко)

- `apps/web` — дашборд на **live Supabase** (`useSupabaseSnapshot`), не seed (seed только offline/fallback).
- `supabase/functions` — auth, data, manual, agent, chat, confirm.
- Деплой: push `main` → Actions (Pages + migrations + functions).

## Чего нет / не путать

- Нет отдельного REST кроме Edge Functions.
- Gemini **не обязателен** для Codex — используй `/agent` и `/manual`.
- `rules/global.md` и др. **не существуют** — только `rules.ts`.
- README «Tasks for Vel» и «dashboard reads seed» — **устарели** (см. актуальный README).

## Если сомневаешься

Спроси пользователя одним вопросом вместо массового `delete` или новой миграции. При конфликте сессий на день — `update_session` цепочкой или `--swallow` с явного согласия.
