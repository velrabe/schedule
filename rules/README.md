# rules/

**Статус:** доменные `.md` файлы здесь **ещё не созданы**. Единственный источник правил для LLM и агентов:

→ [`supabase/functions/_shared/rules.ts`](../supabase/functions/_shared/rules.ts)

Его читает `/chat` (Gemini). Codex при записи через `/agent` должен следовать тем же конвенциям (счета, категории, food→meal, алиасы проектов).

План на будущее: вынести секции из `rules.ts` в `global.md`, `work_sessions.md`, … и подгружать при деплое. Пока дублирование **не делать** — править только `rules.ts`.

Секции в `rules.ts`: `data_model` (связи — читать первой), `chat_ui` (только Gemini UI), `global`, `work_sessions`, `activity`, `nutrition`, `finance`, `body_metrics`, `substances`, `sleep`, `mood`, `planner`.
