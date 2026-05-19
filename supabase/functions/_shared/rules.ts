// Rules loader. In the deployed edge function we read rule files that were
// shipped alongside the function via `supabase functions deploy --import-map …`.
// For now we inline the rule bundle here so the function works without any
// extra deployment trick. Update these strings or move to fetch() of a public
// repo URL if the rule library grows.

const GLOBAL = `
# global rules
- Never write to database without explicit user confirmation, unless action is in the auto-allow list.
- Always preserve original raw text (the backend stores it in raw_logs).
- If confidence is low, ask one short clarification question instead of guessing.
- Return structured JSON only. Top-level shape: { reply_to_user, actions[], needs_confirmation }.
- Timezone: Asia/Ho_Chi_Minh. Resolve "сегодня", "вчера", "утром" relative to it.
- If the user says only a time (e.g. "20:30"), assume today.
- Auto-allow (no confirmation needed): create_substance, create_body_metric, simple session start/end with explicit project.
`;

const WORK = `
# work_sessions
- If user says "начал X" or "стартовал X": create_work_session_open with start_time=now (or extracted time), project=X.
- If user says "закончил" / "закрыл" / "иду <next>": close_work_session for the open session.
- If a new session starts while previous is open, propose closing the previous one with end_time=now and confirm.
- Project aliases: "приложение"→child_app, "пижама"→pajama, "лендинг"→landing, "портфолио"/"портфель"→portfolio, "мамаду"→mamadu, "банк"→bank-proofs.
- "тинькоф" or "капитал" → project=bank-proofs.
`;

const SPORT = `
# activity (sport)
- Canonical durations when not specified: surf=90, pickleball=60, muay_thai=60, bouldering=60, gym=90, run=60, hike=variable.
- Map ru→type: "серф"→surf, "пиклбол"→pickleball, "муай тай"/"тайский бокс"→muay_thai, "болдеринг"/"скалолазание"→bouldering, "зал"/"спортзал"→gym, "пробежка"/"бег"→run, "хайк"/"трекинг"→hike, "стрельба из лука"→archery.
- Always insert into sessions (type=sport, category=sport_<X>) AND optionally activities (denormalised).
`;

const NUTRITION = `
# nutrition
- Estimate calories only if user explicitly asks ("посчитай") or photo provided.
- Store confidence: low | medium | high.
- If portion unknown, estimate and mark confidence=low.
- Always separate kcal, protein_g, fat_g, carbs_g.
- Split into slot: breakfast | lunch | dinner | snack. Resolve by time-of-day if absent.
- Common Vietnamese / Russian foods: "паста с тунцом"→pasta tuna, "манго"→mango, "арбуз"→watermelon, "ананас"→pineapple, "Оранж джус"→orange juice, "айс латте"→iced latte, "хэм чиз тост"→ham&cheese toast, "бургер кимчи"→kimchi burger.
`;

const FINANCE = `
# finance
- Numbers like "120к донгов"→amount=120000 currency=VND. "к"=1000.
- "рублей"→RUB, "$"/"долларов"/"usd"→USD, "донг"/"донгов"/"vnd"/"₫"→VND.
- Default currency VND. Default account: cash (ask if ambiguous between cards).
- Auto-categorise (low confidence): food, transport, rent, health, entertainment, gear, gift.
- type=expense unless user says income/перевод/transfer.
`;

const BODY = `
# body_metrics
- "вес 82.4" → metric=weight_kg, value=82.4, unit=kg.
- "пульс 60" → resting_hr. "hrv 50" → hrv.
- Auto-allow: do not ask confirmation, just insert.
`;

const SUBSTANCES = `
# substances
- "75 мг модафинила", "100мг" → name=modafinil, amount=NN, unit=mg.
- "кофе" or "espresso" or "латте" or "капучино" → name=caffeine, amount=1, unit=cup.
- "выпил" / "вино" / "пиво" → name=alcohol, amount=as_text, unit=drink/glass/shot.
- "weed"/"травка" → name=weed.
- Auto-allow without confirmation.
`;

const SLEEP = `
# sleep
- "лёг в X" / "лёг X" → days.sleep_time = HH:MM.
- "встал в X" / "проснулся X" → days.wake_time = HH:MM.
- "поспал X часов" → days.sleep_hours = X.
- Sleep events update the most-relevant day (the day of the wake time).
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
};

export function loadRules(domains: string[]): string {
  const set = new Set<string>(["global", ...domains]);
  return [...set].map((d) => DOMAIN_RULES[d]).filter(Boolean).join("\n");
}

export const ALL_DOMAINS = Object.keys(DOMAIN_RULES).filter((d) => d !== "global");
