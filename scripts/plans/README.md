# Plan templates for Codex / `schedule-api.mjs`

Copy a file, replace `<uuid>` / dates, then apply.

| File | Command | When |
|------|---------|------|
| `meal-macros-update.manual.json` | `apply-manual` | КБЖУ у существующих meals по `id` |
| `move-activity-day.manual.json` | `apply-manual` | Дневная move-активность (ккал out) |
| `session-time-shift.agent.json` | `apply` | Сдвиг времени сессии |
| `finance-food-link.manual.json` | `apply-manual` | Расход food + привязка к session/event |
| `sport-wake-transport-bundle.agent.json` | `apply` | Проснулся + спорт + транспорт в одной оболочке |
| `substance-scooby.manual.json` | `apply-manual` | +1 scooby с временем (перед обедом и т.п.) |
| `FOCUS_MERGE_FOR_CODEX.md` | — | Промпт + `audit-focus-day.mjs` для склейки work-сессий |

```bash
node scripts/audit-focus-day.mjs 2026-06-01 --write scripts/plans/generated
node scripts/schedule-api.mjs get-day 2026-05-30 > /tmp/day.json
node scripts/schedule-api.mjs apply-manual scripts/plans/meal-macros-update.manual.json
node scripts/schedule-api.mjs apply scripts/plans/session-time-shift.agent.json
```
