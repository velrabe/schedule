/** Canonical substance slugs in `substances.name` (and session_events.category). */

export const SUBSTANCE_MODA = "moda";
export const SUBSTANCE_SCOOBY = "scooby";

const LEGACY_MODA = "modafinil";

export function isModaSubstance(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  return n === SUBSTANCE_MODA || n === LEGACY_MODA;
}
