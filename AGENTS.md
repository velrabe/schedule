# Codex / agents — API без CI и без Gemini

Данные в Supabase можно менять **напрямую через Edge Functions** (JWT). Миграции SQL — только для крупных импортов.

## Быстрый старт

1. Скопируй `apps/web/.env.local` или задай:
   - `SCHEDULE_FUNCTIONS_URL` — `https://<ref>.functions.supabase.co`
   - `SCHEDULE_PASSWORD` — тот же пароль, что в Supabase secret `APP_PASSWORD`
2. Логин и запрос:

```bash
export SCHEDULE_FUNCTIONS_URL="https://YOUR-REF.functions.supabase.co"
export SCHEDULE_PASSWORD="your-app-password"

node scripts/schedule-api.mjs login
node scripts/schedule-api.mjs get sessions --from 2026-05-24 --to 2026-05-29
```

Токен сохраняется в `.schedule-token` (gitignored).

## Endpoints

| Endpoint | Назначение |
|----------|------------|
| `POST /auth/login` | `{ "password" }` → `{ "token" }` |
| `POST /data` | Чтение: `{ "resource", "from?", "to?", "limit?" }` |
| `POST /manual` | CRUD одной строки: `{ "resource", "op", "row?", "id?" }` |
| `POST /agent` | **Пакет действий** (как confirm, без чата): `{ "actions": [...], "swallow_ok?": true }` |
| `POST /chat` | Gemini → предложения (UI) |
| `POST /confirm` | Подтверждение из `raw_logs` после chat |

Все кроме `/auth/login` требуют заголовок `Authorization: Bearer <token>`.

## `/manual` — одна запись

`op`: `insert` | `update` | `delete` | `upsert`

`resource`: `days`, `sessions`, `meals`, `activities`, `substances`, `body_metrics`, `finance_transactions`, `events`, `planner_events`, `mood_logs`, `nutrition_goals`, `accounts`, `balance_snapshots`, `finance_planned_items`

```bash
node scripts/schedule-api.mjs manual upsert days '{"date":"2026-05-30","wake_time":"12:00","sleep_time":"02:00","modafinil_mg":50}'
node scripts/schedule-api.mjs manual insert sessions '{"date":"2026-05-30","start_time":"14:00","end_time":"15:00","duration_min":60,"type":"food","category":"food","project":"обед"}'
```

Food-сессии автоматически создают/связывают `meals`. Finance обновляет балансы счетов.

## `/agent` — расписание и логи пакетом

Те же `actions[]`, что возвращает Gemini в `/chat`. Правила: `supabase/functions/_shared/rules.ts`.

```json
{
  "actions": [
    {
      "type": "update_day",
      "data": {
        "date": "2026-05-30",
        "wake_time": "11:00",
        "sleep_time": "02:00",
        "modafinil_mg": 50,
        "day_type": "work"
      }
    },
    {
      "type": "create_session",
      "data": {
        "date": "2026-05-30",
        "start_time": "16:00",
        "end_time": "17:00",
        "type": "food",
        "category": "food",
        "project": "обед"
      }
    },
    {
      "type": "create_finance_transaction",
      "data": {
        "date": "2026-05-30",
        "time": "16:05",
        "amount": 150000,
        "currency": "VND",
        "account": "vcb_vnd",
        "category": "food",
        "merchant": "Mesala",
        "txn_type": "expense"
      }
    }
  ]
}
```

```bash
node scripts/schedule-api.mjs apply actions.json
# при пересечении сессий на день:
node scripts/schedule-api.mjs apply actions.json --swallow
```

Типы действий: `create_session`, `update_session`, `delete_session`, `create_meal`, `create_activity`, `update_day`, `create_finance_transaction`, `create_event`, `create_planner_event`, … — полный список в `supabase/functions/chat/index.ts`.

## Счета (slug)

- `savings_rub` — Savings RUB
- `ip_rub` — Business RUB
- `vcb_vnd`, `cash_vnd`

## Когда что использовать

| Задача | Инструмент |
|--------|------------|
| Один приём пищи / правка суммы | `/manual` |
| День расписания (5–15 блоков) | `/agent` |
| Массовый импорт истории | SQL migration + `supabase db push` (CI) |
| Скриншот / неструктурированный текст в UI | `/chat` (Gemini) — можно не использовать |

## Codex в репозитории

1. Клон: `git clone https://github.com/velrabe/schedule.git`
2. Читай `AGENTS.md` + `rules.ts` перед записью.
3. Пиши через `scripts/schedule-api.mjs`, не правь прод SQL без необходимости.
4. После записи: `get sessions` / `get finance_transactions` для проверки.

Веб-дашборд подхватывает данные при обновлении страницы (читает те же таблицы через `/data`).
