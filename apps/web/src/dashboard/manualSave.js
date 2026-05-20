/** Persist a single row edit via the manual edge function. */
export async function manualPatch(resource, id, row) {
  const { updateRow, notifyDataChanged } = await import("../api/manual");
  await updateRow(resource, id, row);
  notifyDataChanged();
}

/** Upsert a day row (PK = date). */
export async function manualUpsertDay(date, row) {
  const { upsertRow, notifyDataChanged } = await import("../api/manual");
  await upsertRow("days", { date, ...row });
  notifyDataChanged();
}
