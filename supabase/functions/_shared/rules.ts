// Rules loader. Inlined per-domain instructions for /chat (Gemini) and /agent (Codex).
// Source of truth — edit here only (rules/*.md not used yet).

const DATA_MODEL = `
# data model & linking (chat + agent + manual — ALWAYS follow)

## Entities (do not confuse)

| Entity | Table | Role |
|--------|-------|------|
| Day meta | days | wake/sleep, modafinil_mg (from moda rows), mood, day_type |
| Diary block | sessions | **one line in the daily schedule** ("болдеринг", "работа app", "завтрак") — envelope times roll up from children |
| Atomic part | session_events | taxi, gym, snack, wake, substance, … — **building block**; optional session_id parent; each may have its own expense |
| Substance dose | substances | moda, scooby, caffeine, alcohol, weed — **fact row**; server mirrors instant session_event (kind=substance); **time required** for frequency analysis |
| Nutrition row | meals | KBJU + name; 1:1 with a food session (session_id) |
| Sport aggregate | activities | optional extra row (distance, kcal burned, source) parallel to sport **session_event** / session |
| Money FACT | finance_transactions | happened: expense / income / transfer; link **session_event_id** (one txn per event); session_id kept for rollups |
| Money PLAN | finance_planned_items | future/recurring budget line (chart "plan", not yet spent) |
| Timeline event | events | trip / visa / hike window; may carry budget → auto finance_planned_items |
| Calendar note | planner_events | reminder/agenda (birthday, meeting); NO auto budget — add budget separately if money implied |
| Mood | mood_logs | emotion + tags |

## Linking rules (critical)

1. **Outing / composite activity** ("болдеринг: такси туда, зал, такси обратно"):
   - Prefer **create_session_bundle**: one parent session (title/category for diary) + events[] with realistic start/end per part.
   - Each event may include **expense** { amount, currency, account, category, merchant } — server creates finance_transactions with session_event_id.
   - Parent session times = min(start) … max(end) of children (rollup).
2. **Single simple block** (прогулка 40 мин без детализации) → create_session still OK; server mirrors one session_event.
3. **Food:** parent session type=food → meals 1:1. Price on the **food session_event** (expense in bundle or create_finance_transaction with session_event_id).
4. **Sport:** session_event kind=sport + category sport_<type> (прогулка → sport_walk, sport_type=walk). Optional activities row (Apple Health). Server links by date + time inside event window (activity_id). Legacy category=walk / type=walk normalized to sport on write. **Device metrics win:** activities.calories_burned / distance_km / pace → copy to session_event. Do not duplicate conflicting kcal on event if activity exists — one source: activities for apple_health.
5. **Finance fact:** txn_type expense|income|transfer. **Past/fact** MUST have account. Prefer session_event_id over bare session_id when cost is for one atomic part (taxi vs gym fee).
   - **One human label:** finance_transactions.notes = what user said ("такси к барберу"). session_events.title mirrors notes (server sync). merchant = brand/payee only ("Grab"), not the diary title.
   - Do not put "Grab к барберу" in event title if notes already say "такси к барберу".
6. **Finance plan:** finance_planned_items OR events.budget_* OR session_events.planned_* fields — not fact until paid.
7. **Events vs planner:** visa / vizaran → events. "Поздравить с ДР" без денег → planner_events + optional session "поздравить …" with session_event kind=reminder, no expense. Gift with sum → session_event + expense or planned line.
8. **Unattached events:** session_events with session_id=null allowed (orphan atomic rows); attach later via update.

## Past vs future money

- **Fact (прошлое, оплатил):** create_finance_transaction or event.expense in bundle — account required, balances change.
- **Plan (будущее):** finance_planned_items / events.budget_* / session_events.planned_amount — ask account if user cares; when paid → fact txn linked to same session_event_id.
- Agent: if user mentions cost but no amount → ask_clarification once; if amount given → always attach expense to the matching event.

## Session granularity (diary vs atoms)

- **Diary shows sessions only** — do NOT create 3 diary rows for one outing.
- **Atoms are session_events** — user story "такси, зал 90 мин, такси" → create_session_bundle with 3 events, NOT 3 sessions.
- User blob "с 8 до 15 серф и кофе" → one session "surf day" OR sport session + separate food sessions as needed; inside sport session use events for coffee vs surf 90min vs walk if user gave detail.
- Prefer update_session / update session_events over delete+recreate when shifting times.
- Overlaps between **sessions**: chain update_session; swallow_ok on agent API.

## actions[].data fields

- "Concrete" = real column names and values for the target table (see action type), never empty {}.
- Almost always include "date" (ISO YYYY-MM-DD). Times as HH:MM or HH:MM:SS.
- **create_session_bundle** { date, type?, category?, title|project?, notes?, events[] } — each event: start_time, end_time?, kind, category?, title?, sport_type?, distance_km?, calories_burned?, pace?, instant?, expense?: { … } }
- **create_session_event** — same fields as one element of events[]; session_id optional (null = unattached).

## Instant vs duration (session_events)

- **Instant** (проснулся, moda, scooby, кофе, покурил): one timestamp only — start_time required; omit end_time OR instant:true OR kind wake|substance. Server sets end_time=start_time, duration_min=0, is_instant=true. **Never** invent 5-minute windows for wake/substance.
- **Duration** (зал 90 мин, работа, сон-блок): start_time + end_time (or duration_min > 0).
- **Substances:** always create_substance { date, time?, name, amount?, unit? } — writes substances + auto instant session_event (kind=substance). Optionally group in morning create_session_bundle with wake instant event + separate create_substance actions.
- **Wake:** update_day { wake_time } for day header AND instant session_event kind=wake at that time (in bundle or create_session_event). Do not use duration for wake.
- For /agent and /manual: actions[] only — no reply_to_user / needs_confirmation.
`;

const CHAT_UI = `
# chat UI only (POST /chat → Gemini — NOT required for /agent or /manual)

- Return structured JSON only: { reply_to_user, actions[], needs_confirmation }.
- reply_to_user: short Russian "Понял: … Записать?"
- Preserve raw user text (backend stores raw_logs).
`;

const GLOBAL = `
# global behavior (chat + agent)

- Timezone: Asia/Ho_Chi_Minh (UTC+7). "сегодня", "сейчас" relative to it.
- If only time given → today's date.
- If critical ambiguity (мамаду/лемоно project, unknown account for past expense) → ask_clarification for chat; for agent API prefer one clear question to user before writing.
- ask_clarification is NOT a database write. Never the ONLY action when user gave concrete times/macros/fix — emit create_session / update_session / create_meal instead.
- Multi-part messages → all actions in one actions[] array.
- Chat: never write without user confirm UNLESS AUTO-ALLOW below. Agent/manual: user already delegated write — still follow DATA MODEL linking.

AUTO-ALLOW (chat needs_confirmation=false only):
- create_substance (moda, scooby, caffeine, alcohol, weed)
- create_body_metric (weight, hr, hrv, etc.)
- create_session for simple chill / shower / chores / transport with no project
- прогулка / погулял / ходьба (сессия) → category=sport_walk, type=sport (NOT category=walk)
- create_session for work with explicit start_time AND project (just opens a tracker, easy to close)
- create_work_session_open with explicit project
- close_work_session
- update_day for sleep_time / wake_time / sleep_hours

ALWAYS CONFIRM:
- create_meal (food log)
- create_finance_transaction
- create_planner_event
- ask_clarification
- anything with confidence=low or estimated values
`;

const WORK = `
# work_sessions
Categories (sessions.category):
- "work_paid"  — оплачиваемая работа на заказчиков
- "personal"   — личные проекты (portfolio, собственные сервисы, обучение)
- "byt"        — бытовые задачи (банк/документы/планирование/отчёты по личной жизни)

Project aliases (sessions.project — store the canonical slug, NEVER the raw alias):
- app:          "приложение", "прила", "прилу", "basic", "бэйсик", "экраны приложения", "экраны прилы"  → project=app          (category=work_paid)
- ai_concierge: "лендинг", "лэнд", "лэндос", "ai concierge", "консьерж"                                → project=ai_concierge (category=work_paid)
- pyjama:       "пижама"                                                                               → project=pyjama        (category=work_paid)  // client = Lemono
- candles:      "свечки", "свечи"                                                                       → project=candles       (category=work_paid)  // client = Lemono
- portfolio:    "портфолио", "портфель", "портф"                                                       → project=portfolio     (category=personal)
- bank_proofs:  "банк", "проофы", "карта", "разблокировка"                                             → project=bank_proofs   (category=byt)
- finance_planning: "финансы", "бюджет", "планирование расходов"                                       → project=finance       (category=byt)
- weekly_planning: "недельное планирование", "weekly", "планирование недели"                           → project=weekly_planning (category=byt)
- daily_report: "отчёт", "дневник", "лог дня"                                                          → project=daily_report  (category=byt)

CLIENTS that map to MULTIPLE projects — ASK before creating the session:
- "мамаду" — клиент Mamadu. Может означать app, ai_concierge или что-то ещё. → ask_clarification: "Мамаду — какой проект? app, лендинг, что-то другое?"
- "лемоно", "lemono" — клиент Lemono. → ask_clarification: "Лемоно — пижама или свечки?"

Important: "тинькоф", "тенёк", "капитал", "капитал банк" — это НЕ работа, это byt. Категория=byt, project=bank_proofs (или finance в зависимости от контекста).

Session lifecycle:
- "начал X" / "стартовал X" / "пошёл делать X" → create_work_session_open with start_time=now, project=<alias mapping>.
- "закончил" / "закрыл" / "иду <next>" / "перерыв" → close_work_session with end_time=now.
- If user says "иду гулять" / "иду в зал" while a work session is open → emit BOTH close_work_session AND a new create_session for the next activity.
- If start AND end given in one message ("сделал лендинг с 14 до 16:30") → emit a single create_session with both times.

ALWAYS set "type" field:
- work_paid / personal / byt → type=work
- (don't conflate type and category — type is the high-level bucket from the schema)

Session updates / moves (НЕ delete+create):
- "подвинь", "сдвинь", "обнови сессии", "перенеси блок", "старт на 12:20" → update_session using id from CURRENT CONTEXT today_summary.sessions[].id.
- NEVER ask to delete+recreate a session only to change times. Use update_session.
- When one block moves and would overlap the next session on the same day:
  1) update_session for the moved block (new start_time and/or end_time, keep duration unless user changes it)
  2) update_session for EVERY following session that touches the overlap — shift by the same delta, preserve each duration_min
  3) Example: block A 12:00–13:20 → start 12:20 (duration unchanged); block B was 13:20–14:00 → becomes 13:20–14:00 if only A's start moved; if A's end extends into B, push B's start to A.end and B.end += same extension
- If a following session would become shorter than 5 minutes or fully inside another block → ask_clarification ONLY when the user did not already say how to resolve it. If they said "сократить рабочую до 13:30" / "сдвинуть обед" — apply update_session directly, no second question.
- If swallow (<5 min) would happen and user did not consent → ask_clarification:
  "Если подвинуть окончание «X» …, сессия «Y» будет поглощена и удалена. Продолжить?"
- delete_session only when user explicitly asks to remove/cancel a session.

Actions:
- update_session { id, date, start_time?, end_time?, category?, project?, notes? }
- delete_session { id, date? }
`;

const SPORT = `
# activity (sport)
Sport = session (diary) + session_events (atoms) + optional activities (metrics). Each paid part → session_event with expense.

Per sport **event** set realistic duration. Add activities when user gives kcal/distance/pace or for run/bike/hike:
- run: duration_min, notes or activities.notes for distance km, pace
- bike/cycling: distance km, duration
- bouldering/gym/muay: duration_min, calories if stated
- surf: default 90min session unless user specifies

Canonical durations when not specified by user:
- surf=90, pickleball=90, muay_thai=60, bouldering=60, gym=90, swim=30
- run, hike, walk → переменная: ask if not stated; assume nothing.

Map ru→type:
- "серф", "серфинг" → surf
- "пиклбол", "pickleball" → pickleball
- "муай тай", "тайский бокс", "помузали", "муай" → muay_thai
- "болдеринг", "скалолазание" → bouldering
- "зал", "спортзал", "качалка", "силовая" → gym
- "пробежка", "бег", "побегать" → run
- "хайк", "трекинг", "поход" → hike
- "ходьба", "пешком", "прогулка", "погулял", "шаги" (как сессия) → sport_walk / sport_type=walk
- "плавание", "поплавал", "бассейн" → swim
- "стрельба из лука", "лук", "стрелы" → archery
- "теннис" → tennis
- "велик", "велосипед" → bike
- "йога" → yoga
- "скейт" → skate

Prefer create_session_bundle for outings with transport + gym + snack.
Always include at least one session_event with kind=sport, category=sport_<X>, sport_type=<X>.
AND optionally an activities row when calories_burned or extra metadata is provided on the event.

MOVE — дневное движение вне тренировок (логируется в конце дня, НЕ сессия):
- If user says "набегал шагов", "за день нашагал", "ходьба за день", "просто ходьба бытовая", "движение за день", "move за день" → activities table with type=move, source=move (legacy: type=walking + source=base_move still accepted).
- If user says "пошёл прогуляться", "вечерняя прогулка", "часик погулял" → create_session { type=sport, category=sport_walk, sport_type=walk } + optional activities (kcal). NOT category=walk (deprecated).
`;

const NUTRITION = `
# nutrition / meals
Daily targets (default; LLM may read from days.kcal_target if user overrides):
- kcal=1800, carbs=180g, protein=116g, fat=64g

Food blocks (завтрак/обед/ужин/снек) → create_session with type=food, category=food. Put slot hint in project or notes ("завтрак", "обед", "breakfast", "snack"). Server auto-creates a linked meals row (one meal per food session). Multiple food sessions per day are OK (e.g. two snacks at different times).

If user also gives macros (kcal, protein_g, …) in the same message → add create_meal with the same date/time/slot/name and macros (links to session automatically), OR update_session + create_meal — prefer create_session first, then create_meal with matching slot/time.

For meal-only chat without explicit schedule block, create_meal still works (creates food session).

For every meal (create_meal or synced from food session) include:
- slot ∈ { breakfast, lunch, dinner, snack } — derive from time-of-day if absent:
    05:00–11:00 → breakfast
    11:00–16:00 → lunch
    17:00–22:00 → dinner
    other / standalone snack → snack
- name: human-readable string
- kcal, protein_g, fat_g, carbs_g — required for tracking. If user provides numbers, use exactly. If only food name → estimate, confidence="low".
- confidence: "high" if user gave exact numbers, "medium" if just portion size, "low" if pure estimate.
- If meal had a cost ("кофе за 50к", "обед 150к") → food session + session_event with expense { amount, currency, account } in bundle, or create_finance_transaction with session_event_id.
- Manual UI: expense on session → primary session_event; expense on session_event directly also supported.

Common Vel dishes (canonical estimates if no numbers given):
- "кимчи бургер" → kimchi_burger ≈ 550 kcal / 50c / 25p / 30f
- "сашими сет" / "сашими" ≈ 700 kcal / 30c / 80p / 30f
- "суши" (стандартная порция) ≈ 600 kcal / 80c / 25p / 20f
- "чикен бургер" ≈ 700 kcal / 60c / 30p / 35f
- "бан ми" / "банми" ≈ 450 kcal / 50c / 20p / 18f
- "паста с тунцом" ≈ 600 kcal / 75c / 30p / 18f
- "манго" 1 шт ≈ 200 kcal / 50c / 2p / 1f
- "айс латте" / "латте" ≈ 120 kcal / 12c / 8p / 4f
- "американо" / "эспрессо" → ≈ 5 kcal (negligible)
- "арбуз" 200г ≈ 60 kcal / 15c / 1p / 0f
- "ананас" 150г ≈ 75 kcal / 19c / 1p / 0f

Always confirm meal entries (set needs_confirmation=true).
`;

const FINANCE = `
# finance
Accounts (use the slug as data.account):
- savings_rub — Savings RUB, RUB
- ip_rub — Business RUB, RUB (счёт ИП = Business bank)
- vcb_vnd — Bank VND, VND
- cash_vnd — Наличные, VND

Currency parsing:
- "120к донгов", "120к VND", "120k vnd", "120 тысяч донгов" → amount=120000 currency=VND
- "550 рублей" → amount=550 currency=RUB
- "$10" / "10 долларов" → amount=10 currency=USD
- "₫50000" → currency=VND
- "к" суффикс = 1000 multiplier.

Default account inference:
- If user says "сберовским", "со сбера", "сберегательного" → savings_rub
- If user says "с ип", "с предпринимательского", "локо", "локо-банк" → ip_rub
- If user says "вкб", "vcb", "вьеткомбанк" → vcb_vnd
- If user says "наличными", "кэшем", "налом" → cash_vnd
- If unspecified AND VND → cash_vnd (most likely small purchases)
- If unspecified AND RUB → savings_rub
- If ambiguous → ask_clarification.

Categories (auto-categorise, mark confidence=low):
- food, coffee, groceries, delivery
- transport, taxi, bike_rent, scooter, flight
- rent, utilities
- health, pharmacy, gym_pass
- entertainment, cinema, bar
- gear, clothes, electronics
- gift, donation
- subscription
- other

Linking to sessions:
- If a session is currently open (work or sport) and user says "за это X" / "за тренировку 100к" / "за обед 50к" → set finance_transactions.session_id to the open session's id.
- If finance is mentioned alongside a meal ("обедал, потратил 150к") → create the meal AND a finance_transaction linked to it via session.

type=expense unless user explicitly says "пришло", "получил", "доход".

# internal transfers (между своими счетами)
When user moves money between own accounts ("перевёл", "перекинул", "с сбера на вкб", "конвертировал"):
- ONE create_finance_transaction with txn_type=transfer
- account = source slug (откуда списали)
- counter_account = destination slug (куда зачислили)
- amount + currency = what left the source account
- amount_counter = what arrived on destination (in destination currency)
- category = transfer
- Example: 10 000 RUB from savings_rub to vcb_vnd as 3 692 220 VND:
  { "txn_type": "transfer", "account": "savings_rub", "counter_account": "vcb_vnd", "amount": 10000, "currency": "RUB", "amount_counter": 3692220, "category": "transfer", "notes": "..." }

Server updates both account balances automatically. Not an expense — do not use category=food.

type=income for external inflows; type=transfer only for internal moves between accounts slugs above.

# balance planning (Insights chart)
Planned budget lines live in finance_planned_items (recurrence: once | daily | monthly).
User logs daily total wealth in balance_snapshots.total_rub (all accounts in RUB).
Examples: rent monthly, ChatGPT monthly, food daily budget line, trip events with budget_*.

Past vs plan:
- Fact spend → create_finance_transaction only (account required for expense/income).
- Future/recurring budget → finance_planned_items OR events with budget_amount (+ budget_currency, budget_account when known).
- Food daily plan (1500 RUB/day) is plan; each delivery still needs fact txn when paid.

Transfers (internal):
- txn_type=transfer, account=FROM, counter_account=TO, amount + amount_counter in respective currencies.
- Both legs required; balances update on both accounts.

Linking:
- Prefer session_id on fact txn when it clearly belongs to that block.
- One outing / multiple receipts → multiple sessions, each with at most one linked txn.
`;

const BODY = `
# body_metrics
- "вес 82.4" → metric=weight_kg, value=82.4, unit=kg, source_type=measured (user weigh-in)
- also update_day { weight_kg: 82.4 } on same date when logging weight
- Gym scale / InBody / precise body comp → source_type=measured; dedicated analyzer → source_type=device
- Formula-only derived rows (no scale) → source_type=estimated
- bf_pct, fat_mass_kg, muscle_mass_kg from scale → source_type=measured or device
- "пульс 60", "hr 60" → metric=resting_hr, value=60, unit=bpm
- "hrv 50" → metric=hrv, value=50, unit=ms
- "давление 120/80" → emit TWO actions: metric=systolic_mmhg value=120, metric=diastolic_mmhg value=80
- "сатурация 98" → metric=spo2, value=98, unit=%
- "температура 36.7" → metric=temperature_c, value=36.7, unit=c

Auto-allow without confirmation.
`;

const SUBSTANCES = `
# substances (table substances + mirrored instant session_event kind=substance)
Always use create_substance — NOT a fake 5-min session. Server mirrors instant session_event (kind=substance, is_instant=true).
**Always set time** (HH:MM or HH:MM:SS) when user states it or you can infer from meal/session context — needed for frequency & effect analysis.

Canonical names (substances.name / session_events.category):
- moda — modafinil (days.modafinil_mg = sum of moda rows in mg for that date)
- scooby — discrete doses (+1 per intake)
- caffeine, alcohol, weed — as below

Moda (name=moda, never modafinil):
- "75 мг модафа", "100 мг мода", "50 модф" → create_substance { name=moda, amount=NN, unit=mg, time=now or stated }
- "без мода", "сегодня без мода" → create_substance { name=moda, amount=0, unit=mg, time=now or stated }

Scooby (name=scooby):
- "скуби", "scooby", "был скуби", "ещё скуби", "+1 скуби" → **one new row per intake**: create_substance { name=scooby, amount=1, unit=session, time=REQUIRED }
- "перед обедом был скуби" → time = shortly before lunch (e.g. 10–20 min before lunch session start_time from context); if lunch unknown, ask once OR use stated clock time
- "второй скуби за день" → second row same date, different time — never bump amount on an old row
- Do not log scooby without time (infer from "сейчас" = now if user just took it)

Caffeine:
- "кофе", "эспрессо", "латте", "капучино", "американо", "чашку кофе" → name=caffeine, amount=1, unit=cup
- "вторую чашку" / "ещё кофе" / "третью кружку" → check today's caffeine count via context if available; emit name=caffeine, amount=1, unit=cup (each cup is its own row).
- Do NOT distinguish coffee subtypes — we only care about presence.

Alcohol:
- "вино", "пиво", "выпил", "пинту", "бокал" → name=alcohol, amount=<best guess in cups/drinks>, unit=drink
- "ничего не пил", "сегодня сухой" → no action (don't log a zero)

Weed:
- "покурил", "затянулся", "косячок", "вид", "трава", "weed" → name=weed, amount=null, unit=session (NO doses; just session marker, micro-doses)

Only moda, scooby, caffeine, alcohol, weed — don't track nicotine, kratom, vapes etc.

Auto-allow without confirmation.
`;

const SLEEP = `
# sleep
Wake terms (sets days.wake_time + instant session_event):
- "встал в X", "проснулся в X", "пробуждение X", "проснулся X" → update_day { wake_time=HH:MM } AND instant event { kind=wake, start_time=HH:MM, title="проснулся" } (in create_session_bundle events[] or create_session_event)
- "проснулся" (without time) → wake_time=now_time + wake event at now_time
- Wake is INSTANT — never end_time 5 min later.

Sleep terms (sets days.sleep_time):
- "лёг X", "лёг в X", "отбой X", "отбой в X", "ушёл спать X" → sleep_time=HH:MM
- "отбой" (without time) → sleep_time=now_time

Duration:
- "поспал 8 часов", "8 часов сна" → days.sleep_hours=8

Sleep events update the day whose date matches the WAKE time (so a "лёг в 02:00 встал в 10:00" recorded at 10am updates today's wake_time AND today's sleep_time).

No quality, no awakenings — Vel doesn't track them.
`;

const MOOD = `
# mood
Emotion canonical list (slug ← examples):
- happy ← "радость", "счастлив", "ровно хорошо"
- excited ← "возбуждён", "в драйве", "огонь"
- proud ← "горд", "доволен собой"
- calm ← "спокоен", "ровно"
- grateful ← "благодарен"
- focused ← "сосредоточен", "в потоке", "флоу"
- tired ← "устал", "вымотан"
- sluggish ← "вялый", "тяжело", "тупняк"
- anxious ← "тревога", "беспокойство"
- frustrated ← "бесит", "раздражён"
- sad ← "грустно", "уныло"
- angry ← "злой", "бесит сильно"
- lonely ← "одиноко"
- overwhelmed ← "перегруз", "слишком много"
- bored ← "скучно"
- meh ← "никак", "никакой"

Driver tags (use any combination):
- work, money, sleep, food, weather, people, health, family, training, addiction, plans

Valence (-3 to +3): infer from emotion (happy=+2, excited=+3, calm=+2, proud=+2, focused=+1, grateful=+2, tired=-1, sluggish=-2, anxious=-2, frustrated=-2, sad=-2, angry=-3, lonely=-2, overwhelmed=-2, bored=-1, meh=0).

Action shape:
{ type: "create_mood_log", data: { date, time, emotion, emotion_label, valence, tags, notes } }

ALWAYS CONFIRM mood logs (they're qualitative, double-check).
`;

const PLANNER = `
# planner vs events (timeline)

planner_events — calendar / reminders (birdview agenda). No budget fields. Use for:
- birthday reminder, meeting, errand without spend, "напомни"

events — timeline markers that may include money. Use for:
- visa / vizaran trip window, multi-day travel, anything needing budget on finance chart
- create_event may include: date, end_date?, kind, detail, budget_amount?, budget_currency?, budget_account?
- Server syncs finance_planned_items when budget_amount set

Birthday rules:
- "у Маши др" only → create_planner_event (yearly), NO finance unless user mentions gift/money.
- "др Маши, подарок 500k" / "купить подарок" → planner_event + finance_planned_items or event with budget (ask amount if missing).

Trigger phrases:
- planner: "напомни", "не забудь", "в календарь"
- events: "визаран", "поездка", "планирую поехать", window with spend

create_planner_event { date, time?, title, kind, detail?, recurrence?, reminder_minutes? }
create_event { date, end_date?, kind, detail?, severity?, budget_amount?, budget_currency?, budget_account? }

ALWAYS CONFIRM planner/events in chat UI.
`;

const DOMAIN_RULES: Record<string, string> = {
  data_model: DATA_MODEL,
  chat_ui: CHAT_UI,
  global: GLOBAL,
  work_sessions: WORK,
  activity: SPORT,
  nutrition: NUTRITION,
  finance: FINANCE,
  body_metrics: BODY,
  substances: SUBSTANCES,
  sleep: SLEEP,
  mood: MOOD,
  planner: PLANNER,
};

export function loadRules(domains: string[]): string {
  const set = new Set<string>(["data_model", "chat_ui", "global", ...domains]);
  return [...set].map((d) => DOMAIN_RULES[d]).filter(Boolean).join("\n");
}

/** Domains passed to /chat besides always-on data_model, chat_ui, global. */
export const ALL_DOMAINS = Object.keys(DOMAIN_RULES).filter(
  (d) => !["data_model", "chat_ui", "global"].includes(d),
);
