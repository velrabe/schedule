# Модель «фазы дня» (эталон для агента)

Краткая логика ивентов / родителей / `get-day` vs обход БД — в [`rules.ts`](../../supabase/functions/_shared/rules.ts) → `data_model` → **Logical event model (READ FIRST)**.

Сессия = **непересекающийся** блок. Внутри — `session_events[]` с реальным временем каждого атома.

## Пример: 2026-06-01

| Фаза (session project) | Envelope | Events внутри |
|------------------------|----------|---------------|
| пробуждение и завтрак | 9:05–11:15 | подъём, кофе+заказ, app 10:00–10:10, завтрак |
| приложение | 11:15–11:15? | один атом 11:15 (можно одна короткая session) |
| перерыв, скуби | 12:15–13:05 | chill + create_substance scooby |
| приложение | 13:05–14:30 | work |
| перекус, скуби, кофе, растяжка | 14:30–15:30 | перекус, scooby, кофе, растяжка |
| работа, заказ обед | 15:30–17:30 | app, заказ обед, app — **без** отдельной food-сессии 16:47–18:00 |
| обед, чилл, скуби | 17:30–19:00 | обед+meal, chill, scooby |
| пижама свечи | 19:00–19:20 | пижама, свечи |
| прогулка | 19:20–22:00 | сбор, scooby, walk |
| воркаут+душ | 22:00–22:30 | gym, shower |
| ужин+чил | 22:30–23:40 | заказ, scooby, ужин |
| отбой | 01:00 | sleep instant |

## Промпт для перестройки дня

См. [`CODEX_REBUILD_DAY_PHASES.md`](CODEX_REBUILD_DAY_PHASES.md). Кратко:

```
AGENTS.md → сценарий rebuild
rules.ts: data_model → Day phases + Patch vs full rebuild
delete all sessions YYYY-MM-DD → apply: update_day + N× create_session_bundle + create_substance
scooby/moda → create_substance (не в project сессии)
get-day: ~10–15 sessions, без overlaps фаз
```
