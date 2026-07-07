/**
 * Money entered by hand: tolerate the grouping the user actually types
 * ("3.259.395", "3 259 395") so a large amount is never silently dropped by a
 * number input that rejects the value.
 * ponytail: a single dot stays a decimal separator (22.4 USD); grouped
 * thousands need ≥2 separators or spaces.
 */
export function parseAmount(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if ((s.match(/\./g) || []).length >= 2) s = s.replace(/\./g, "");
  if ((s.match(/,/g) || []).length >= 2) s = s.replace(/,/g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
