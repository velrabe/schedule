// Runnable check for hand-typed money parsing. `node parseAmount.selfcheck.mjs`.
import assert from "node:assert/strict";
import { parseAmount } from "./money.js";

// The exact VND grouping the user types — must NOT be dropped.
assert.equal(parseAmount("3.259.395"), 3259395);
assert.equal(parseAmount("3 259 395"), 3259395);
assert.equal(parseAmount("1.500.000"), 1500000);
assert.equal(parseAmount("55 000"), 55000);
// Plain numbers and decimals still work.
assert.equal(parseAmount("3259395"), 3259395);
assert.equal(parseAmount("22.4"), 22.4); // single dot = decimal (USD)
assert.equal(parseAmount("1,5"), 1.5);
assert.equal(parseAmount(10000), 10000);
assert.equal(parseAmount(""), null);
assert.equal(parseAmount(null), null);

console.log("parseAmount selfcheck OK");
