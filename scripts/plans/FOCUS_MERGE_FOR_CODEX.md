# Склейка work-сессий (узкий patch — не пересборка фаз)

> **Не используй этот файл**, если пользователь просит **фазы дня** / полную перестройку дня.  
> Тогда: [`CODEX_REBUILD_DAY_PHASES.md`](CODEX_REBUILD_DAY_PHASES.md) + [`day-phases-model.md`](day-phases-model.md) + `rules.ts` → **Day phases** / **Patch vs full rebuild**.

Этот сценарий — **хирургия**: два+ подряд `work_paid` с одним `project` и паузой ≤20 мин → одна session. День уже в целом по фазам, но внутри work остались дубли.

Правила склейки: `rules.ts` → `work_sessions` (update_session, не delete ради смены времени) + `data_model` (фазы не пересекаются).

## 1. Аудит дня

```bash
node scripts/codex-check.mjs
node scripts/schedule-api.mjs get-day YYYY-MM-DD
node scripts/audit-focus-day.mjs YYYY-MM-DD
node scripts/audit-focus-day.mjs YYYY-MM-DD --write scripts/plans/generated
```

Скрипт выведет work-сессии с id и **micro-merge groups** (gap ≤20 мин, один project). При `--write` — `merge-focus-DATE.agent.json` / `.manual.json`.

Применение:

```bash
node scripts/schedule-api.mjs apply-manual scripts/plans/generated/merge-focus-YYYY-MM-DD.manual.json
node scripts/schedule-api.mjs apply scripts/plans/generated/merge-focus-YYYY-MM-DD.agent.json
```

## 2. Промпт для Codex (только micro-merge)

```
git pull origin main
AGENTS.md → таблица «Выбор сценария» → ветка FOCUS_MERGE (не rebuild)

День YYYY-MM-DD: склей соседние work-сессии с gap ≤20 мин и одним project.
1) get-day YYYY-MM-DD
2) audit-focus-day.mjs YYYY-MM-DD
3) update первой session, delete остальных в группе; перед delete — manual update session_events.session_id на оставляемую
4) chill / food / sport / substances — не сливать в work envelope
5) scooby/moda — только create_substance, не в project сессии
6) audit-focus-day снова → micro-merge groups пусто

Только apply / apply-manual. Без миграций SQL.
```

## 3. SQL-миграция?

**Нет** — правка данных по id из API.

## 4. Отличие от фаз

| | Focus merge | Day phases rebuild |
|--|-------------|-------------------|
| Когда | 2–3 лишних work подряд | весь день / overlaps / микро-sessions |
| Sessions/день | уже ~10–15 | целево ~10–15 после delete+bundle |
| Инструмент | update + delete work | delete all sessions → create_session_bundle |
