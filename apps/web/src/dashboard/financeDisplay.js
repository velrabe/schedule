export const ACCOUNT_LABELS = {
  savings_rub: "Savings RUB",
  ip_rub: "Business RUB",
  vcb_vnd: "Bank VND",
  cash_vnd: "Наличные",
};

export function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  if (currency === "VND") return `${Math.round(n).toLocaleString("ru-RU")} ₫`;
  if (currency === "RUB") return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
  return `${n} ${currency || ""}`;
}

export function accountLabel(id) {
  if (!id) return "—";
  return ACCOUNT_LABELS[id] || id;
}

/** Human label for a finance row in lists. */
export function financeTxnLabel(t) {
  if (t._planned || (t.txn_type || "").toLowerCase() === "planned") {
    const kind = (t._planned_txn_type || "expense").toLowerCase();
    const sign = kind === "income" ? "+" : "−";
    return `план ${sign}${fmtMoney(t.amount, t.currency)}`;
  }
  const type = (t.txn_type || "expense").toLowerCase();
  if (type === "transfer" && t.counter_account && t.amount_counter != null) {
    return `перевод ${accountLabel(t.account)} → ${accountLabel(t.counter_account)}: −${fmtMoney(t.amount, t.currency)} / +${fmtMoney(t.amount_counter, inferCounterCurrency(t))}`;
  }
  if (type === "income") {
    return `приход +${fmtMoney(t.amount, t.currency)} · ${accountLabel(t.account)}`;
  }
  return `расход −${fmtMoney(t.amount, t.currency)} · ${accountLabel(t.account)}`;
}

function inferCounterCurrency(t) {
  const to = t.counter_account;
  if (to === "savings_rub" || to === "ip_rub") return "RUB";
  if (to === "vcb_vnd" || to === "cash_vnd") return "VND";
  return t.currency || "";
}

export function financeTxnShortMeta(t) {
  if (t._planned || (t.txn_type || "").toLowerCase() === "planned") {
    return t.notes || "запланировано";
  }
  if ((t.txn_type || "").toLowerCase() === "transfer") {
    return t.category || "transfer";
  }
  return `${t.category || "—"} · ${t.merchant || t.account || ""}`;
}

/** One-line amount for day columns (no long transfer prose). */
export function financeTxnCompactLabel(t) {
  if (t._planned || (t.txn_type || "").toLowerCase() === "planned") {
    const kind = (t._planned_txn_type || "expense").toLowerCase();
    const sign = kind === "income" ? "+" : "−";
    return `план ${sign}${fmtMoney(t.amount, t.currency)}`;
  }
  const type = (t.txn_type || "expense").toLowerCase();
  if (type === "transfer") {
    return `⇄ ${fmtMoney(t.amount, t.currency)}`;
  }
  if (type === "income") {
    return `+${fmtMoney(t.amount, t.currency)}`;
  }
  return `−${fmtMoney(t.amount, t.currency)}`;
}

/** Short second line: merchant or category only. */
export function financeTxnCompactMeta(t) {
  if (t._planned || (t.txn_type || "").toLowerCase() === "planned") {
    return (t.merchant || t.category || "план").trim();
  }
  if ((t.txn_type || "").toLowerCase() === "transfer") {
    const from = accountLabel(t.account);
    const to = t.counter_account ? accountLabel(t.counter_account) : "";
    return to ? `${from} → ${to}` : from;
  }
  return (t.merchant || t.category || accountLabel(t.account) || "—").trim();
}

export function financeTxnRowTitle(t) {
  const parts = [financeTxnLabel(t), financeTxnShortMeta(t)];
  if (t.notes) parts.push(t.notes);
  return parts.filter(Boolean).join("\n");
}
