/** VND per 1 USD — BREX balance sync (keep in sync with financeFx.ts). */
export const VND_PER_USD = 26333;

export function vndToUsd(vnd) {
  if (!Number.isFinite(vnd)) return 0;
  return Math.round((vnd / VND_PER_USD) * 100) / 100;
}

/** Approx RUB per 1 unit — value-preserving transfer credit when amount_counter is missing. */
export const RUB_PER_UNIT = {
  RUB: 1,
  VND: 10000 / 3692220,
  USD: 92,
  USDT: 92,
};

export function convertAmount(amount, fromCurrency, toCurrency) {
  const from = RUB_PER_UNIT[(fromCurrency || "").toUpperCase()];
  const to = RUB_PER_UNIT[(toCurrency || "").toUpperCase()];
  if (!from || !to) return null;
  return (Math.abs(Number(amount) || 0) * from) / to;
}

export function balanceAmount(accountId, txnCurrency, amount, accountCurrency) {
  const cur = (txnCurrency || "").toUpperCase();
  const ac = (accountCurrency || "").toUpperCase();
  const abs = Math.abs(Number(amount) || 0);
  if (accountId === "brex" && cur === "VND" && ac === "USD") return vndToUsd(abs);
  return abs;
}

export function currencyMatches(accountId, txnCurrency, accountCurrency) {
  if (!accountId) return false;
  const tc = (txnCurrency || "").toUpperCase();
  const ac = (accountCurrency || "").toUpperCase();
  if (!ac || !tc) return true;
  if (accountId === "brex" && tc === "VND" && ac === "USD") return true;
  return ac === tc;
}

export function balanceDeltas(row, accountCurrencies) {
  const amount = Math.abs(Number(row.amount) || 0);
  const counter = row.amount_counter != null ? Math.abs(Number(row.amount_counter)) : 0;
  const type = (row.txn_type || "expense").toLowerCase();
  const from = row.account;
  const to = row.counter_account;
  const cur = (row.currency || "").toUpperCase();

  if (type === "transfer" && from && to && counter > 0) {
    const out = [];
    if (currencyMatches(from, cur, accountCurrencies[from])) {
      out.push({ account: from, delta: -balanceAmount(from, cur, amount, accountCurrencies[from]) });
    }
    const destCur = accountCurrencies[to] || cur;
    if (currencyMatches(to, destCur, accountCurrencies[to])) {
      out.push({ account: to, delta: balanceAmount(to, destCur, counter, accountCurrencies[to]) });
    }
    return out;
  }
  // Transfer without an explicit amount_counter: never destroys money, so credit
  // the destination too (same currency → same amount, else FX-converted). Mirrors
  // financeBalanceSync.ts — otherwise reconcile only debits the source and the
  // destination (e.g. VCB) drifts negative.
  if (type === "transfer" && from && to) {
    const out = [];
    if (currencyMatches(from, cur, accountCurrencies[from])) {
      out.push({ account: from, delta: -balanceAmount(from, cur, amount, accountCurrencies[from]) });
    }
    const destCur = (accountCurrencies[to] || cur).toUpperCase();
    const credit = destCur === cur ? amount : convertAmount(amount, cur, destCur);
    if (credit != null && credit > 0 && currencyMatches(to, destCur, accountCurrencies[to])) {
      out.push({ account: to, delta: balanceAmount(to, destCur, credit, accountCurrencies[to]) });
    }
    if (out.length) return out;
  }
  if (type === "transfer" && from && currencyMatches(from, cur, accountCurrencies[from])) {
    return [{ account: from, delta: -balanceAmount(from, cur, amount, accountCurrencies[from]) }];
  }
  if (type === "income" && from && currencyMatches(from, cur, accountCurrencies[from])) {
    return [{ account: from, delta: balanceAmount(from, cur, amount, accountCurrencies[from]) }];
  }
  if (type === "expense" && from && currencyMatches(from, cur, accountCurrencies[from])) {
    return [{ account: from, delta: -balanceAmount(from, cur, amount, accountCurrencies[from]) }];
  }
  return [];
}
