/** Approximate VND per 1 USD — multi-currency card (BREX) balance sync. */
export const VND_PER_USD_DEFAULT = 26333;

export function vndToUsd(vnd: number, rate = VND_PER_USD_DEFAULT): number {
  if (!Number.isFinite(vnd) || !rate) return 0;
  return Math.round((vnd / rate) * 100) / 100;
}

/** USD delta for a txn leg on a multi-currency account (e.g. brex: ledger VND, balance USD). */
export function multiCurrencyBalanceUsd(
  accountId: string,
  txnCurrency: string,
  amount: number,
  accountCurrency: string,
): number | null {
  const cur = (txnCurrency || "").toUpperCase();
  const ac = (accountCurrency || "").toUpperCase();
  if (accountId === "brex" && cur === "VND" && ac === "USD") {
    return vndToUsd(Math.abs(amount));
  }
  return null;
}

/**
 * Approx RUB per 1 unit — only used to keep a transfer value-preserving when
 * `amount_counter` is missing, so the total balance doesn't leak the moved sum.
 * ponytail: coarse fixed rates (mirror of the web FX_RUB_PER_UNIT). The exact
 * credited amount from the bank belongs in `amount_counter`; this is a floor.
 */
export const RUB_PER_UNIT: Record<string, number> = {
  RUB: 1,
  VND: 10000 / 3692220,
  USD: 92,
  USDT: 92,
};

/** Convert an amount between currencies via the RUB pivot. null when a rate is unknown. */
export function convertAmount(amount: number, fromCurrency: string, toCurrency: string): number | null {
  const from = RUB_PER_UNIT[(fromCurrency || "").toUpperCase()];
  const to = RUB_PER_UNIT[(toCurrency || "").toUpperCase()];
  if (!from || !to) return null;
  return (Math.abs(Number(amount) || 0) * from) / to;
}
