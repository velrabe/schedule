# Codex: перестройка дня по фазам (обязательно прочитать)

## Перед стартом

```bash
git pull origin main   # нужен scripts/plans/day-phases-model.md
node scripts/codex-check.mjs
node scripts/schedule-api.mjs login   # только если 401
```

Читать: `AGENTS.md` → **`rules.ts`** (`data_model`: **Logical event model READ FIRST** → Day phases → Patch vs full rebuild) → `day-phases-model.md`.

## Задача

**Не** точечные `update_session` по 20 микро-блокам.  
**Да** — удалить сессии дня и заново записать **~10–15 фаз** через `create_session_bundle`.

## Правила

1. **sessions одного дня не пересекаются** (overlap-check с wake дня).
2. **Фаза** = один `create_session_bundle`: `project` = название фазы, `events[]` = атомы с реальным временем.
3. Заказ обеда **во время работы** → `kind=food` event **внутри** work-фазы, **не** отдельная food-session на 16:47–18:00.
4. **scooby / moda / caffeine** → только `create_substance` (не строки «substance» в канбане).
5. Отбой `01:00` — instant `kind=sleep` (duration 0), **не** пересекается с утром (это хвост дня, не overlap).
6. Прогулка / workout: `create_activity` + sport event в bundle; **не** подставлять заранее придуманные UUID — только id из ответа API.
7. Еда со скринов: `create_meal` + expense на food-event; finance → `session_event_id`.

## Эталон 2026-06-01 (сокращённо)

| Фаза | Envelope | Events |
|------|----------|--------|
| пробуждение и завтрак | 9:05–11:15 | wake, кофе, app 10:00–10:10, завтрак |
| приложение | 11:15–12:15 | work |
| перерыв, скуби | 12:15–13:05 | chill + create_substance scooby |
| … | … | см. day-phases-model.md |
| работа, заказ обед | 15:30–17:30 | app, заказ обед 16:40–16:45, app |
| обед, чилл, скуби | 17:30–19:00 | meal, chill, scooby |
| прогулка | 19:20–22:00 | сбор, scooby, walk |
| воркаут + душ | 22:00–22:30 | gym, shower |
| ужин + чил | 22:30–01:00 | заказ, scooby, ужин, chill |
| отбой | 01:00 | sleep instant |

## Алгоритм

1. `get-day YYYY-MM-DD` → сохранить id meals/finance если нужно перепривязать.
2. Удалить **все sessions** этого дня (cascade events) через `manual delete` или план в `scripts/plans/`.
3. `apply` с JSON: `update_day` (wake, sleep, mod) + N× `create_session_bundle` + `create_substance` + `create_meal` / finance.
4. `get-day` — sessions ≈ число фаз (~10–15), нет пересечений по времени (кроме instant sleep 01:00 vs утро). Опционально: `audit-focus-day.mjs` — только если остались лишние micro work (см. FOCUS_MERGE).

## Не делать

- 20+ отдельных `create_session` на каждый 10-минутный work.
- Параллельные food + work на одни часы.
- `activity_id` / `session_id` в manual до insert (FK error).
- Правки кода репозитория без просьбы пользователя.
