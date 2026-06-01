# Склейка work-сессий — что передать Codex

Правила уже в проде: `rules.ts` → **Focus / cognitive load** (деплой `6205717+`).

## 1. Локально: аудит дня (нужен login)

```bash
cd /path/to/schedule
node scripts/schedule-api.mjs login          # или SCHEDULE_API_KEY в codex.env
node scripts/audit-focus-day.mjs 2026-06-01
node scripts/audit-focus-day.mjs 2026-06-01 --write scripts/plans/generated
```

Скрипт выведет:
- все `work_paid` / `personal` / `byt` с **id**
- **focus blocks** (как в инсайтах UI)
- группы **micro-merge** (две+ сессии подряд с gap ≤20 мин и одним `project`)
- при `--write` — готовые `merge-focus-DATE.agent.json` + `.manual.json`

Применение (если скрипт нашёл дубли):

```bash
node scripts/schedule-api.mjs apply-manual scripts/plans/generated/merge-focus-2026-06-01.manual.json
node scripts/schedule-api.mjs apply scripts/plans/generated/merge-focus-2026-06-01.agent.json
```

## 2. Текст для Codex (скопировать в задачу)

Замени `YYYY-MM-DD` на день (например `2026-06-01`).

```
Прочитай AGENTS.md и supabase/functions/_shared/rules.ts (секции data_model + Focus / cognitive load).

День YYYY-MM-DD — приведи work-сессии к фокус-блокам. НЕ трогай миграции SQL.

1) node scripts/codex-check.mjs && node scripts/schedule-api.mjs login
2) node scripts/schedule-api.mjs get-day YYYY-MM-DD  → сохрани sessions + session_events
3) node scripts/audit-focus-day.mjs YYYY-MM-DD  → посмотри micro-merge groups

Правила склейки:
- Непрерывная работа с одним project и пауза ≤20 мин между work-сессиями → ОДНА session (update первой, delete остальных).
- Перед delete_session: manual update всех session_events с удаляемых session_id → session_id оставляемой.
- chill / food / sport / substances — отдельные строки, НЕ внутрь work envelope.
- scooby/moda/caffeine — только substances + parallel instant events, не в project сессии.
- Убери дубли mirror: если у work-сессии один child event с тем же 10:00–10:10 что и parent — delete лишний event или оставь только parts с реальной детализацией (кофе, grab, перекус).

Целевые фокус-блоки (пример для 2026-06-01 — уточни по get-day):
- приложение 11:15–12:15 (если несколько work подряд — склей)
- приложение 13:05–14:30
- приложение 15:30–19:30

После правок:
- node scripts/audit-focus-day.mjs YYYY-MM-DD  → micro-merge groups должны быть пусто
- integrity: orphan_events, sessions_without_events, food без meal_id = 0

Только API (apply / apply-manual), без Python. Коммит в репо не нужен unless код менял.
```

## 3. Нужна ли SQL-миграция?

**Нет** для склейки сессий — это правка данных через API по конкретным `id`.

Миграции уже применены для scooby:
- `0021` detach substance events
- `0022` promote bundled substances
- `0023` extract scooby from text

## 4. Что уже ок на скрине (2026-06-01)

- **скуби ×3** — три строки в `substances` — нормально.
- **Три фокус-блока** (11:15–12:15, 13:05–14:30, 15:30–19:30) — нормально (между ними chill/еда).
- Чинить нужно только если внутри блока несколько `work_paid` с gap ≤20 мин — audit покажет.

## 5. sport 2.5h vs 2.8h в UI

Разные агрегаты: «Часы» = sum sessions; «инсайты» = `insightsCompute` (чуть другой набор категорий). Не баг склейки — отдельная задача если мешает.
