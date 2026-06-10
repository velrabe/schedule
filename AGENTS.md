# Codex / Cursor — инструкция для агентов

**Читай первым.** Репозиторий: личный трекер (расписание, еда, финансы). Данные в Supabase; UI — GitHub Pages.

## Выбор сценария (главное)

| Запрос пользователя | Документ | Действие |
|---------------------|----------|----------|
| Полный день / «по фазам» / много микро-sessions, overlaps | [`CODEX_REBUILD_DAY_PHASES.md`](scripts/plans/CODEX_REBUILD_DAY_PHASES.md) + [`day-phases-model.md`](scripts/plans/day-phases-model.md) | `get-day` → delete **все** sessions дня → один `apply` (~10–15× `create_session_bundle` + substances/meals) |
| Сдвинуть блок, КБЖУ, +scooby, одна правка | Fast path ниже | `update_session` / `apply-manual` / ≤3 `manual` |
| Только склейка соседних work (gap ≤20 мин) | [`FOCUS_MERGE_FOR_CODEX.md`](scripts/plans/FOCUS_MERGE_FOR_CODEX.md) | `audit-focus-day.mjs` — **не** замена пересборки фаз |

Правила домена (связи, фазы, patch vs rebuild): **`supabase/functions/_shared/rules.ts`** → `data_model` — **сначала** секция **Logical event model (READ FIRST)**, затем Day phases, Instant vs duration. Отдельного `rules/*.md` нет.

## Логическая модель ивентов (кратко для Codex)

Полный текст и пример 3 июня — в `rules.ts` → `data_model` → **Logical event model (READ FIRST)**. Суть:

1. Есть время старта → это атом (`session_events`).
2. Нет окончания по смыслу → по умолчанию **моментальный** ивент (факт).
3. Есть окончание → **продолжительный** ивент.
4. К атому можно привязать расход, приём пищи, активность, дозу субстанции — у leaf-данных логически есть **родительский атом**; не «угадывать» из БД без запроса.
5. Приём пищи: слот (завтрак/обед/ужин/снек) + КБЖУ; транзакция при оплате — к ивенту еды; без оплаты / неясно — один раз проговорить или спросить.
6. Все атомы дня — внутри **сессий-фаз** (`create_session_bundle`), без пересечения фаз.
7. `notes` / title — только дополнение, не дублировать merchant, суммы, КБЖУ из finance / meals.

**Грамматика инпута (парсить буквально, ничего не выдумывать):** пользователь пишет день фаза-группами. Заголовок без времени («утро», «рабочий блок №1», «подготовка к прогулке») = **одна сессия**. Строка со временем = **ровно один ивент** (в том же порядке): `HH:MM–HH:MM` → продолжительный, `HH:MM` без конца → моментальный. **`(+ …)` = вложения на ЭТОТ ивент, а НЕ новые ивенты:** `+расход/+доход/+трансфер` → finance_transaction с `session_event_id`; `+пища/+кбжу` → meal; `+скуби/+кофе/+мода` → create_substance; `+активность` → activity. Вложение **наследует время ивента** — не создавай отдельный ивент и не выдумывай ему тайминг; один ивент может нести несколько `+`. Заголовок ивента = слова пользователя; merchant/сумма/счёт идут в привязанную строку, не в title. Полная таблица и пример («подготовка к прогулке» = 2 ивента, а не 4) — в `rules.ts` → `data_model` → **Input grammar (PARSE LITERALLY)**.

**Интерфейс записи:** читай правила → собери `apply` / `apply-manual` → отправь. Для id существующего дня: **один** `get-day YYYY-MM-DD`; не делай серию `get` по всем таблицам, чтобы «восстановить схему» или текущие поля, если пользователь не просил аудит.

**Модель:** session = **фаза** (непересекающийся блок); `session_events` = атомы внутри; scooby/moda/caffeine → `create_substance`, не в `project` сессии. Заказ обеда во время работы → event в work-фазе, не параллельная food-session.

## Fast path — запись без правок кода

```bash
node scripts/codex-check.mjs          # раз в сессию; login только при 401
node scripts/schedule-api.mjs get-day YYYY-MM-DD > /tmp/day.json
node scripts/schedule-api.mjs apply scripts/plans/….agent.json
node scripts/schedule-api.mjs apply-manual scripts/plans/….manual.json
```

| Задача | Инструмент | Избегать |
|--------|------------|----------|
| Один день | `get-day` | серия `get` по всем таблицам «ради схемы» |
| Много блоков / фазы | один `apply` | N× `manual` на sessions/events |
| КБЖУ meals | `apply-manual` `update meals` + `id` | правки `session_events` ради meal |
| Сдвиг времени | `update_session` с `id` из get-day | `update` без id; delete+recreate **только ради времени** |

Шаблоны: [`scripts/plans/README.md`](scripts/plans/README.md).

**`manual update`:** `{ "op":"update", "resource":"meals|sessions|…", "id":"<uuid>", "row":{…} }` — id только из API, валидный hex UUID.

**`apply`:** `{ "actions": [ { "type", "data" } ] }` — для фаз предпочитай **`create_session_bundle`** (`events[]` с реальными start/end). `create_substance` для scooby/moda/caffeine.

После записи: один `get-day`; **не пушь** репо и **не деплой** functions без просьбы.

**Запреты скорости:** нет Python/curl-скриптов в `/tmp`; нет `rg` по `supabase/functions` для data-only; нет десятков `manual`, если хватает одного `apply`.

## Жёсткие запреты

1. **Не трогай** `supabase/migrations/*.sql` без явной просьбы.
2. **Не коммить** `.env`, `.schedule-token`, ключи.
3. **Не** `service_role` в скриптах агента.
4. **Не** счёт `loco_rub` — ИП = `ip_rub`.
5. **UUID** только из ответа API (`[0-9a-f-]{36}`), не выдумывать.
6. **Не** пересекающиеся sessions (work + food на одни часы).
7. **Не** 20+ micro `create_session` / patch `session_events`, если нужна модель фаз — **rebuild** (см. таблицу выше).
8. **Не удаляй** sessions с `finance_transactions` без понимания балансов.

## Auth / URL

`SCHEDULE_FUNCTIONS_URL` или авто из `schedule.project.ref`. Auth: `SCHEDULE_TOKEN`, `SCHEDULE_API_KEY`, `SCHEDULE_PASSWORD`, `codex.env` / `agent.api.key`. Codex часто не видит env в shell → `scripts/codex-setup.sh` или `codex.env`. `fetch failed` → `SCHEDULE_USE_CURL=1`. TZ: **Asia/Ho_Chi_Minh**.

## API (кратко)

Все POST кроме login. Bearer после login.

| Endpoint | Назначение |
|----------|------------|
| `/data` | `get` таблиц |
| `/manual` | одна строка insert/update/delete |
| `/agent` | пакет `actions[]` |
| `/chat` | Gemini (опционально) |

`get-day` = удобная обёртка за день. `409 swallow_required` → согласовать с пользователем → `"swallow_ok": true`.

### Типы `/agent` (частые)

| type | Когда |
|------|--------|
| `create_session_bundle` | **фаза дня** (утро, работа+обед, прогулка…) |
| `create_session` | один простой блок |
| `update_session` | сдвиг по id |
| `delete_session` | явная просьба / rebuild дня |
| `create_substance` | scooby, moda, caffeine, … |
| `create_meal` | макросы |
| `create_finance_transaction` | расход → `session_event_id` |
| `create_activity` | sport / move |

`reply_to_user` / `needs_confirmation` — **только `/chat`**, не для Codex.

## Связки и субстанции

```
days → sessions (фазы) → session_events (атомы)
     → substances (scooby/moda + time) → mirror instant event
     → meals.session_id
finance_transactions.session_event_id
```

| name | Запись |
|------|--------|
| `moda` | mg + time → `days.modafinil_mg` |
| `scooby` | amount:1, unit:session, **новая строка на каждый приём**, time обязателен |
| `caffeine` | cup + time |

Не `name=modafinil`. Scooby не дублировать в title фазы вместо `create_substance`.

## Счета

`savings_rub`, `ip_rub`, `vcb_vnd`, `cash_vnd`. Transfer: `txn_type=transfer`, `account`, `counter_account`, `amount`, `amount_counter`.

## Workflow Codex (кратко)

1. `codex-check` → при patch: **один** `get-day` за дату (id из ответа).
2. По таблице «Выбор сценария» — rebuild **или** patch.
3. Один `apply` / `apply-manual`; id только из шага 1.
4. `get-day` для проверки (~10–15 sessions, без overlaps между фазами).

## Миграции / архитектура

Миграции — только по запросу. `apps/web` — live Supabase. Правила — только `rules.ts`. README «Tasks for Vel» / seed-only dashboard — устарели.

## Если сомневаешься

Один вопрос пользователю вместо массового `delete` или новой миграции. Конфликт сессий на уже правильном дне — `update_session` цепочкой; на «переделай день» — **CODEX_REBUILD**, не 36× manual.
