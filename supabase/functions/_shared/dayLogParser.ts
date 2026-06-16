/** Deterministic parser: user day-log text → DayPlan (no LLM). */

export type AttachmentKind =
  | "meal"
  | "expense"
  | "income"
  | "transfer"
  | "substance"
  | "activity"
  | "skip";

export type ParsedAttachment = {
  kind: AttachmentKind;
  raw: string;
  substance?: "scooby" | "caffeine" | "moda";
  merchant?: string;
  account?: string;
  counter_account?: string;
  amount?: number;
  currency?: string;
  amount_counter?: number;
  counter_currency?: string;
  notes?: string;
  txn_type?: "expense" | "income" | "transfer";
  /** Filled after OCR merge */
  meal?: {
    name?: string;
    kcal?: number;
    protein_g?: number;
    fat_g?: number;
    carbs_g?: number;
    portion_grams?: number;
    notes?: string;
  };
  activity?: {
    type?: string;
    calories_burned?: number;
    distance_km?: number;
    pace?: string;
    notes?: string;
  };
  /** Screenshot match hint (HH:MM) — never written to DB */
  screenshot_time?: string;
  missing?: string[];
};

export type ParsedEvent = {
  start: string;
  end: string;
  title: string;
  instant: boolean;
  attachments: ParsedAttachment[];
};

export type ParsedSession = {
  project: string;
  events: ParsedEvent[];
};

export type DayPlan = {
  date: string;
  modafinil_mg: number | null;
  wake_time: string | null;
  sleep_time: string | null;
  sessions: ParsedSession[];
  clarifications: string[];
};

const MONTHS: Record<string, number> = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};

const ACCOUNT_ALIASES: Record<string, string> = {
  vcb: "vcb_vnd",
  "vcb vnd": "vcb_vnd",
  brex: "brex",
  bybit: "bybit",
  ип: "ip_rub",
  ip: "ip_rub",
  sber: "savings_rub",
  сбер: "savings_rub",
};

function padTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function stripChatPrefix(line: string): string {
  return line.replace(/^\[\d{2}\.\d{2}\.\d{4}[^\]]*\]\s*[^:]+:\s*/i, "").trim();
}

function parseDayLine(line: string, defaultYear: number): { date: string; modafinil_mg: number | null } | null {
  const s = stripChatPrefix(line);
  const m = s.match(/^(\d{1,2})\s+([а-яa-z]+)/i);
  if (!m) return null;
  const day = Number(m[1]);
  const monthKey = m[2].toLowerCase().slice(0, 5);
  let month = 0;
  for (const [k, v] of Object.entries(MONTHS)) {
    if (monthKey.startsWith(k.slice(0, Math.min(k.length, 5)))) {
      month = v;
      break;
    }
  }
  if (!month) return null;
  const modM = s.match(/\((\d+)\s*м?\s*г/i);
  const modafinil_mg = modM ? Number(modM[1]) : null;
  const date = `${defaultYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, modafinil_mg };
}

function normalizeTimeLine(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(\d{1,2}:\d{2}):(\d{1,2}:\d{2})/, "$1-$2");
  s = s.replace(/^(\d{1,2})-(\d{2}):(\d{1,2}):(\d{2})/, "$1:$2-$3:$4");
  s = s.replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*-\s+/, "$1-$2 ");
  return s;
}

function parseTimeLine(line: string): { start: string; end: string; rest: string; instant: boolean } | null {
  const s = normalizeTimeLine(stripChatPrefix(line));
  const range = s.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+)$/i);
  if (range) {
    return {
      start: padTime(range[1]),
      end: padTime(range[2]),
      rest: range[3].trim(),
      instant: false,
    };
  }
  const instant = s.match(/^(\d{1,2}:\d{2})\s+(.+)$/i);
  if (instant) {
    const start = padTime(instant[1]);
    return { start, end: start, rest: instant[2].trim(), instant: true };
  }
  return null;
}

function isHeaderLine(line: string): boolean {
  const s = stripChatPrefix(line).trim();
  if (!s) return false;
  if (parseDayLine(s, 2026)) return false;
  if (parseTimeLine(s)) return false;
  if (/^vel rabe:/i.test(s)) return false;
  return true;
}

function parseAccount(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, id] of Object.entries(ACCOUNT_ALIASES)) {
    if (lower.includes(alias)) return id;
  }
  const m = lower.match(/\b(vcb_vnd|brex|bybit|ip_rub|savings_rub|cash_vnd)\b/);
  return m?.[1];
}

function parseAmountCurrency(text: string): { amount?: number; currency?: string } {
  const usdt = text.match(/([+-]?\d+(?:[.,]\d+)?)\s*usdt/i);
  if (usdt) return { amount: Number(usdt[1].replace(",", ".")), currency: "USDT" };
  const usd = text.match(/([+-]?\d+(?:[.,]\d+)?)\s*usd/i);
  if (usd) return { amount: Number(usd[1].replace(",", ".")), currency: "USD" };
  const mln = text.match(/([+-]?\d+(?:[.,]\d+)?)\s*млн/i);
  if (mln) return { amount: Number(mln[1].replace(",", ".")) * 1_000_000, currency: "VND" };
  const tys = text.match(/(\d+(?:[.,]\d+)?)\s*тыс/i);
  if (tys) return { amount: Number(tys[1].replace(",", ".")) * 1000, currency: "VND" };
  const vnd = text.match(/([+-]?\d[\d.\s]*)\s*vnd/i);
  if (vnd) {
    const n = Number(vnd[1].replace(/[\s.]/g, "").replace(/,/g, ""));
    return { amount: n, currency: "VND" };
  }
  const num = text.match(/([+-]?\d[\d\s.,]*)/);
  if (num) {
    const cleaned = num[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return { amount: n, currency: "VND" };
  }
  return {};
}

function parseMerchant(text: string): string | undefined {
  const m = text.match(/(?:магазин|merchant|мерчант)\s*:?\s*([A-Za-zА-Яа-я0-9]+)/i);
  if (m) return m[1];
  const grab = text.match(/\b(GrabFood|GrabMarket|GrabMarker|GrabTaxi|OpenAI|LotteMart|Shein|pharmacy)\b/i);
  if (grab) return grab[1];
  if (/^расход\s+(\S+)/i.test(text)) {
    const r = text.match(/^расход\s+(\S+)/i);
    if (r && !/^\d/.test(r[1])) return r[1];
  }
  if (/досуг/i.test(text)) return "досуг";
  return undefined;
}

function classifyAttachment(raw: string): ParsedAttachment {
  const part = raw.trim().replace(/^\+/, "").trim();
  const lower = part.toLowerCase();

  if (/без расхода/i.test(part)) {
    return { kind: "skip", raw: part };
  }
  if (/^скуби|scooby/i.test(part)) {
    return { kind: "substance", raw: part, substance: "scooby" };
  }
  if (/^кофе|caffeine/i.test(part)) {
    return { kind: "substance", raw: part, substance: "caffeine" };
  }
  if (/^мода|moda/i.test(part)) {
    return { kind: "substance", raw: part, substance: "moda" };
  }
  if (/^пища|^кбжу|^еда/i.test(part)) {
    return { kind: "meal", raw: part, meal: {} };
  }
  if (/^активность|^activity/i.test(part)) {
    return { kind: "activity", raw: part, activity: { type: "move" } };
  }
  if (/^доход|^income/i.test(part)) {
    const { amount, currency } = parseAmountCurrency(part);
    return {
      kind: "income",
      raw: part,
      txn_type: "income",
      amount,
      currency,
      account: parseAccount(part),
      merchant: parseMerchant(part) || parseAccount(part),
    };
  }
  if (/^трансфер|^transfer/i.test(part)) {
    const { amount, currency } = parseAmountCurrency(part);
    const counter = part.match(/(?:на сч[её]т|→|->)\s*(\w+)/i);
    return {
      kind: "transfer",
      raw: part,
      txn_type: "transfer",
      amount: amount != null ? Math.abs(amount) : undefined,
      currency,
      account: parseAccount(part.split(/→|->|на сч/i)[0] || part),
      counter_account: counter ? parseAccount(counter[1]) : parseAccount(part.split(/→|->|на сч/i)[1] || ""),
      notes: part,
    };
  }
  if (/^расход|^expense/i.test(part) || /расход/i.test(part)) {
    const { amount, currency } = parseAmountCurrency(part);
    return {
      kind: "expense",
      raw: part,
      txn_type: "expense",
      amount,
      currency,
      account: parseAccount(part),
      merchant: parseMerchant(part),
      notes: part,
    };
  }
  if (/groceries|гросер/i.test(part)) {
    const { amount, currency } = parseAmountCurrency(part);
    return {
      kind: "expense",
      raw: part,
      txn_type: "expense",
      amount,
      currency,
      account: parseAccount(part),
      merchant: parseMerchant(part) || "groceries",
      notes: part,
    };
  }
  return { kind: "skip", raw: part };
}

function splitAttachmentsBlock(block: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of block) {
    if (ch === "(") depth++;
    if (ch === ")" && depth > 0) depth--;
    if (ch === "+" && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseEventRest(rest: string): { title: string; attachments: ParsedAttachment[] } {
  let title = rest.trim();
  const attachments: ParsedAttachment[] = [];

  const parenBlocks: string[] = [];
  title = title.replace(/\(([^()]*(?:\+[^()]*)*)\)/g, (_, inner) => {
    parenBlocks.push(inner);
    return " ";
  }).trim();

  const allAttachText = parenBlocks.join(", ");
  for (const part of splitAttachmentsBlock(allAttachText)) {
    const att = classifyAttachment(part);
    if (att.kind !== "skip") attachments.push(att);
  }

  title = title.replace(/\s+/g, " ").replace(/[-–—]\s*$/, "").trim();
  return { title, attachments };
}

function inferKind(title: string, instant: boolean): string {
  const t = title.toLowerCase();
  if (instant && /отбой|sleep/i.test(t)) return "sleep";
  if (instant && /подъ[её]м|wake/i.test(t)) return "wake";
  if (/завтрак|breakfast/.test(t)) return "food";
  if (/обед|lunch/.test(t)) return "food";
  if (/ужин|dinner/.test(t)) return "food";
  if (/прогулк|пробежк|walk|run|sport/.test(t)) return "sport";
  if (/душ|shower/.test(t)) return "shower";
  if (/чилл|chill|тупняк|отдых/.test(t)) return "chill";
  if (/свечи|работ|app|приложен|видео|планир|презентац|созвон|лендинг/.test(t)) return "work";
  return instant ? "other" : "chill";
}

function mealSlot(title: string, start: string): string {
  const t = title.toLowerCase();
  if (/завтрак/.test(t)) return "breakfast";
  if (/обед/.test(t)) return "lunch";
  if (/ужин/.test(t)) return "dinner";
  if (/снек|перекус|перерыв/.test(t)) return "snack";
  const h = Number(start.split(":")[0]) || 12;
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

/** Parse user day-log text into a structured plan. */
export function parseDayLogText(text: string, defaultYear = 2026): DayPlan | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let date: string | null = null;
  let modafinil_mg: number | null = null;
  let dayLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const d = parseDayLine(lines[i], defaultYear);
    if (d) {
      date = d.date;
      modafinil_mg = d.modafinil_mg;
      dayLineIdx = i;
      break;
    }
  }
  if (!date) return null;

  const sessions: ParsedSession[] = [];
  let current: ParsedSession | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (i === dayLineIdx) continue;
    const line = lines[i];
    if (isHeaderLine(line)) {
      current = { project: stripChatPrefix(line).trim(), events: [] };
      sessions.push(current);
      continue;
    }
    const tl = parseTimeLine(line);
    if (!tl) continue;
    if (!current) {
      current = { project: "день", events: [] };
      sessions.push(current);
    }
    const { title, attachments } = parseEventRest(tl.rest);
    current.events.push({
      start: tl.start,
      end: tl.end,
      title: title || "ивент",
      instant: tl.instant,
      attachments,
    });
  }

  if (!sessions.length) return null;

  const wakeEv = sessions.flatMap((s) => s.events).find((e) => /подъ[её]м|wake/i.test(e.title));
  const sleepEv = [...sessions].reverse().flatMap((s) => s.events).find((e) =>
    /отбой|sleep/i.test(e.title)
  );

  const clarifications: string[] = [];
  for (const sess of sessions) {
    for (const ev of sess.events) {
      for (const att of ev.attachments) {
        if (att.kind === "meal" && !att.meal?.kcal) {
          att.missing = [`КБЖU для «${ev.title}» ${ev.start} (нужен скрин или цифры)`];
          clarifications.push(att.missing[0]);
        }
        if (att.kind === "expense" && att.amount == null) {
          att.missing = [`Сумма расхода для «${ev.title}» ${ev.start} (merchant: ${att.merchant || "?"})`];
          clarifications.push(att.missing[0]);
        }
        if (att.kind === "expense" && !att.account) {
          const q = `Счёт для расхода «${ev.title}» ${ev.start}`;
          att.missing = [...(att.missing || []), q];
          clarifications.push(q);
        }
        if (att.kind === "income" && (att.amount == null || !att.account)) {
          clarifications.push(`Доход на «${ev.title}» ${ev.start}: укажи сумму и счёт`);
        }
      }
    }
  }

  return {
    date,
    modafinil_mg,
    wake_time: wakeEv?.start ?? null,
    sleep_time: sleepEv?.start ?? null,
    sessions,
    clarifications: [...new Set(clarifications)],
  };
}

export function inferEventKind(ev: ParsedEvent): string {
  return inferKind(ev.title, ev.instant);
}

export function inferMealSlotForEvent(ev: ParsedEvent): string {
  return mealSlot(ev.title, ev.start);
}

export function looksLikeDayLog(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  const hasDay = /\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(t);
  const timeLines = (t.match(/^\s*\d{1,2}:\d{2}/gm) || []).length;
  return hasDay && timeLines >= 3;
}
