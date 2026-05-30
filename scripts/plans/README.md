# Plan templates for Codex / `schedule-api.mjs`

Copy a file, replace `<uuid>` / dates, then apply.

| File | Command | When |
|------|---------|------|
| `meal-macros-update.manual.json` | `apply-manual` | КБЖУ у существующих meals по `id` |
| `move-activity-day.manual.json` | `apply-manual` | Дневная move-активность (ккал out) |
| `session-time-shift.agent.json` | `apply` | Сдвиг времени сессии |
| `finance-food-link.manual.json` | `apply-manual` | Расход food + привязка к session/event |
| `sport-wake-transport-bundle.agent.json` | `apply` | Проснулся + спорт + транспорт в одной оболочке |

```bash
node scripts/schedule-api.mjs get-day 2026-05-30 > /tmp/day.json
node scripts/schedule-api.mjs apply-manual scripts/plans/meal-macros-update.manual.json
node scripts/schedule-api.mjs apply scripts/plans/session-time-shift.agent.json
```
