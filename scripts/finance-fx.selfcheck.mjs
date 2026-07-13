// Parity check for the reconcile mirror. `node scripts/finance-fx.selfcheck.mjs`.
// Keep in lockstep with supabase/functions/_shared/financeBalanceSync.selfcheck.ts.
import assert from "node:assert/strict";
import { balanceDeltas } from "./finance-fx.mjs";

const cur = { savings_rub: "RUB", vcb_vnd: "VND", cash_vnd: "VND" };
const byAcc = (rows) => Object.fromEntries(rows.map((r) => [r.account, Math.round(r.delta)]));

// RUB → VND transfer WITHOUT amount_counter: the destination must be credited
// (FX-converted), not silently dropped — the bug that left VCB negative on reconcile.
const noCounter = byAcc(
  balanceDeltas(
    { txn_type: "transfer", account: "savings_rub", counter_account: "vcb_vnd", amount: 10000, currency: "RUB", amount_counter: null },
    cur,
  ),
);
assert.equal(noCounter.savings_rub, -10000, `source debit wrong: ${noCounter.savings_rub}`);
assert.equal(noCounter.vcb_vnd, 3692220, `destination not credited: ${noCounter.vcb_vnd}`);

// Explicit amount_counter (the real bank number) is honored exactly.
const withCounter = byAcc(
  balanceDeltas(
    { txn_type: "transfer", account: "savings_rub", counter_account: "vcb_vnd", amount: 10000, currency: "RUB", amount_counter: 3259395 },
    cur,
  ),
);
assert.equal(withCounter.vcb_vnd, 3259395, `explicit counter ignored: ${withCounter.vcb_vnd}`);

// Same-currency transfer without a counter → equal-and-opposite legs.
const sameCur = byAcc(
  balanceDeltas(
    { txn_type: "transfer", account: "vcb_vnd", counter_account: "cash_vnd", amount: 500000, currency: "VND", amount_counter: null },
    cur,
  ),
);
assert.equal(sameCur.vcb_vnd, -500000);
assert.equal(sameCur.cash_vnd, 500000);

console.log("finance-fx mirror selfcheck OK");
