/** Client-side heuristic: route to /parse-day instead of /chat. */
export function looksLikeDayLog(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  const hasDay = /\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(t);
  const timeLines = (t.match(/^\s*\d{1,2}:\d{2}/gm) || []).length;
  return hasDay && timeLines >= 3;
}
