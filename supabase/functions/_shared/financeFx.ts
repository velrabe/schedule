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
