// Runnable check for transfer balance deltas.
// `node --experimental-strip-types financeBalanceSync.selfcheck.ts` (Node ≥ 22.6).
import assert from "node:assert/strict";
import { balanceDeltas } from "./financeBalanceSync.ts";

const accounts = { savings_rub: "RUB", vcb_vnd: "VND", cash_vnd: "VND" };
const byAcc = (rows: Array<{ account: string; delta: number }>) =>
  Object.fromEntries(rows.map((r) => [r.account, Math.round(r.delta)]));

// RUB → VND transfer WITHOUT amount_counter: outflow was counted but the inflow
// used to vanish. Now the destination is credited (FX-converted) so the total holds.
const noCounter = byAcc(
  balanceDeltas(
    { id: "1", txn_type: "transfer", account: "savings_rub", counter_account: "vcb_vnd", amount: 10000, currency: "RUB", amount_counter: null },
    accounts,
  ),
);
assert.equal(noCounter.savings_rub, -10000, `source debit wrong: ${noCounter.savings_rub}`);
assert.equal(noCounter.vcb_vnd, 3692220, `destination not credited: ${noCounter.vcb_vnd}`);

// Explicit amount_counter (the real bank number) is honored exactly.
const withCounter = byAcc(
  balanceDeltas(
    { id: "2", txn_type: "transfer", account: "savings_rub", counter_account: "vcb_vnd", amount: 10000, currency: "RUB", amount_counter: 3500000 },
    accounts,
  ),
);
assert.equal(withCounter.vcb_vnd, 3500000, `explicit counter ignored: ${withCounter.vcb_vnd}`);

// Same-currency transfer without a counter → equal-and-opposite legs.
const sameCur = byAcc(
  balanceDeltas(
    { id: "3", txn_type: "transfer", account: "vcb_vnd", counter_account: "cash_vnd", amount: 500000, currency: "VND", amount_counter: null },
    accounts,
  ),
);
assert.equal(sameCur.vcb_vnd, -500000);
assert.equal(sameCur.cash_vnd, 500000);

console.log("financeBalanceSync selfcheck OK");
