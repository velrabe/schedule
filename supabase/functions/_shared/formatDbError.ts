/** Readable PostgREST / Supabase error for API responses (Codex debugging). */
export function formatDbError(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    const parts: string[] = [];
    if (err.code != null) parts.push(String(err.code));
    if (err.message != null) parts.push(String(err.message));
    if (err.details != null) parts.push(String(err.details));
    if (err.hint != null) parts.push(`hint: ${err.hint}`);
    if (parts.length) return parts.join(" | ");
  }
  return e instanceof Error ? e.message : String(e);
}
