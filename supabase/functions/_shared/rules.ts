// Rules loader. Inlined per-domain instructions for Gemini.
// Updated 2026-05-20 from Vel's discovery dump.

const GLOBAL = `
# global rules
- Never write to database without explicit user confirmation, UNLESS the action is in the AUTO-ALLOW list below.
- Always preserve the original raw text (the backend stores it in raw_logs).
- If a critical field is ambiguous (project for "мамаду" / "лемоно", meal slot when message is short), ask one short Russian clarification question via type=ask_clarification.
- Return structured JSON only. Top-level shape: { reply_to_user, actions[], needs_confirmation }.
- Timezone: Asia/Ho_Chi_Minh (UTC+7). Resolve "сегодня", "вчера", "утром", "сейчас", "только что" relative to it.
- If the user gives only a time (e.g. "20:30"), assume today.
- actions[].data MUST contain concrete fields, never empty {}. Always include "date".
- reply_to_user is short Russian: "Понял: …. Записать?" or "Записал: …."

AUTO-ALLOW (needs_confirmation=false — backend will auto-confirm):
- create_substance (modafinil, caffeine, alcohol, weed)
- create_body_metric (weight, hr, hrv, etc.)
- create_session for simple walk / chill / shower / chores / transport with no project
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
`;

const SPORT = `
# activity (sport)
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
- "ходьба", "пешком", "шаги", "погулял пешком" → walk
- "плавание", "поплавал", "бассейн" → swim
- "стрельба из лука", "лук", "стрелы" → archery
- "теннис" → tennis
- "велик", "велосипед" → bike
- "йога" → yoga
- "скейт" → skate

Always insert:
- a session row: type=sport, category=sport_<X>, project=<X> if specific.
- AND optionally an activities row when calories_burned or extra metadata is provided.

WALK as base daily move (НЕ тренировка):
- If user says "набегал шагов", "за день нашагал", "ходьба за день", "просто ходьба бытовая" → activities table with type=walking, source="base_move".
- If user says "пошёл прогуляться", "вечерняя прогулка", "часик погулял" → session with type=walk, category=walk (this is a session, not base move).
`;

const NUTRITION = `
# nutrition / meals
Daily targets (default; LLM may read from days.kcal_target if user overrides):
- kcal=1800, carbs=180g, protein=116g, fat=64g

For every meal create a create_meal action with:
- slot ∈ { breakfast, lunch, dinner, snack } — derive from time-of-day if absent:
    05:00–11:00 → breakfast
    11:00–16:00 → lunch
    17:00–22:00 → dinner
    other / standalone snack → snack
- name: human-readable string
- kcal, protein_g, fat_g, carbs_g — required for tracking. If user provides numbers, use exactly. If only food name → estimate, confidence="low".
- confidence: "high" if user gave exact numbers, "medium" if just portion size, "low" if pure estimate.
- If meal had a cost ("кофе за 50к"), also emit a create_finance_transaction with currency=VND or RUB depending on phrasing.

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
- ip_rub — Счёт ИП, RUB
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
- If user says "с ип", "с предпринимательского" → ip_rub
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

type=expense unless user explicitly says "пришло", "получил", "доход", "перевод", "перевёл себе".

For income / transfer, also update the corresponding accounts.balance (use update_account action — if not present skip, just log the transaction).
`;

const BODY = `
# body_metrics
- "вес 82.4" → metric=weight_kg, value=82.4, unit=kg
- "пульс 60", "hr 60" → metric=resting_hr, value=60, unit=bpm
- "hrv 50" → metric=hrv, value=50, unit=ms
- "давление 120/80" → emit TWO actions: metric=systolic_mmhg value=120, metric=diastolic_mmhg value=80
- "сатурация 98" → metric=spo2, value=98, unit=%
- "температура 36.7" → metric=temperature_c, value=36.7, unit=c

Auto-allow without confirmation.
`;

const SUBSTANCES = `
# substances
Modafinil:
- "75 мг модафа", "100 мг модафинила", "50 модф" → name=modafinil, amount=NN, unit=mg
- "без модафа", "сегодня без" → name=modafinil, amount=0, unit=mg

Caffeine:
- "кофе", "эспрессо", "латте", "капучино", "американо", "чашку кофе" → name=caffeine, amount=1, unit=cup
- "вторую чашку" / "ещё кофе" / "третью кружку" → check today's caffeine count via context if available; emit name=caffeine, amount=1, unit=cup (each cup is its own row).
- Do NOT distinguish coffee subtypes — we only care about presence.

Alcohol:
- "вино", "пиво", "выпил", "пинту", "бокал" → name=alcohol, amount=<best guess in cups/drinks>, unit=drink
- "ничего не пил", "сегодня сухой" → no action (don't log a zero)

Weed:
- "покурил", "затянулся", "косячок", "вид", "трава", "weed" → name=weed, amount=null, unit=session (NO doses; just session marker, micro-doses)

Nothing else — don't try to track nicotine, kratom, vapes etc.

Auto-allow without confirmation.
`;

const SLEEP = `
# sleep
Wake terms (sets days.wake_time):
- "встал в X", "проснулся в X", "пробуждение X", "проснулся X" → wake_time=HH:MM
- "проснулся" (without time) → wake_time=now_time

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
# planner (upcoming events / agenda)
Trigger phrases:
- "напомни", "не забудь", "запиши в планер", "у X день рождения", "встреча", "виза заканчивается", "сходить в банк"

Action shape:
{ type: "create_planner_event", data: { date, time?, title, kind, detail?, recurrence?, reminder_minutes? } }

Kinds:
- birthday, meeting, visa, errand, trip, deadline, appointment, holiday, other

Examples:
- "у Маши др 28 июля" → { date: "<next 07-28>", title: "Маша — др", kind: "birthday", recurrence: "yearly" }
- "встреча с Колей в среду 15:00" → resolve next Wednesday relative to today, kind=meeting
- "виза заканчивается 12 августа" → { date: "2026-08-12", title: "виза", kind: "visa" }

ALWAYS CONFIRM planner events.
`;

const DOMAIN_RULES: Record<string, string> = {
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
  const set = new Set<string>(["global", ...domains]);
  return [...set].map((d) => DOMAIN_RULES[d]).filter(Boolean).join("\n");
}

export const ALL_DOMAINS = Object.keys(DOMAIN_RULES).filter((d) => d !== "global");
