#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const xlsx =
  process.argv[2] ||
  "/path/to/export.xlsx";
const out = "supabase/migrations/0019_import_weight_lafkigafk.sql";

function parseXlsx(path) {
  const tmp = "/tmp/schedule-xlsx-gen";
  execSync(`rm -rf ${tmp} && mkdir -p ${tmp} && unzip -q "${path}" -d ${tmp}/xlsx`);
  const sst = readFileSync(`${tmp}/xlsx/xl/sharedStrings.xml`, "utf8");
  const strings = [];
  const re = /<t[^>]*>([^<]*)<\/t>/g;
  let m;
  while ((m = re.exec(sst))) strings.push(m[1]);
  const sheet = readFileSync(`${tmp}/xlsx/xl/worksheets/sheet1.xml`, "utf8");
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(sheet))) {
    const cells = [];
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      let val = cm[4];
      if (cm[3].includes('t="s"') && val) val = strings[+val];
      cells.push({ col: cm[1], val });
    }
    if (cells.length) rows.push(cells);
  }
  let colMap = {};
  for (const cells of rows) {
    if (cells.map((c) => c.val).includes("Weight(Kg)")) {
      for (const c of cells) if (c.val) colMap[c.val] = c.col;
      break;
    }
  }
  const data = [];
  for (const cells of rows) {
    const get = (name) => cells.find((c) => c.col === colMap[name])?.val;
    const dateRaw = get("Date");
    const weight = get("Weight(Kg)");
    if (!dateRaw || !weight || dateRaw === "Date") continue;
    if (!/\d{2}\/\d{2}\/\d{4}/.test(String(dateRaw))) continue;
    const [mm, dd, yyyy] = String(dateRaw).split("/");
    const timeRaw = get("Time");
    const time =
      timeRaw && /^\d{1,2}:\d{2}$/.test(String(timeRaw))
        ? `${String(timeRaw).padStart(5, "0")}:00`
        : null;
    data.push({
      date: `${yyyy}-${mm}-${dd}`,
      time,
      weight: parseFloat(weight),
      bf: parseFloat(get("Fat(%)")) || null,
      muscle: parseFloat(get("Muscle weight(Kg)")) || null,
      fatMass: parseFloat(get("Body fat weight(Kg)")) || null,
    });
  }
  return data.sort((a, b) =>
    `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`),
  );
}

if (!existsSync(xlsx)) {
  console.error("Missing:", xlsx);
  process.exit(1);
}

const data = parseXlsx(xlsx);
const lines = [
  "-- Import lafkigafk body-composition scale (device readings)",
  "",
  "insert into days (date)",
  "select v.d::date from (values",
];

const days = [...new Set(data.map((r) => r.date))].sort();
lines.push(days.map((d) => `  ('${d}')`).join(",\n"));
lines.push(") as v(d) on conflict (date) do nothing;");
lines.push("");

const latest = new Map();
for (const r of data) latest.set(r.date, r.weight);
for (const [d, w] of latest) {
  lines.push(`update days set weight_kg = ${w} where date = '${d}';`);
}
lines.push("");

for (const r of data) {
  const t = r.time ? `'${r.time}'` : "null";
  lines.push(
    `insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('${r.date}', ${t}, 'weight_kg', ${r.weight}, 'kg', 'device', 'lafkigafk');`,
  );
  if (r.bf != null)
    lines.push(
      `insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('${r.date}', ${t}, 'bf_pct', ${r.bf}, '%', 'device', 'lafkigafk');`,
    );
  if (r.fatMass != null)
    lines.push(
      `insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('${r.date}', ${t}, 'fat_mass_kg', ${r.fatMass}, 'kg', 'device', 'lafkigafk');`,
    );
  if (r.muscle != null)
    lines.push(
      `insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('${r.date}', ${t}, 'muscle_mass_kg', ${r.muscle}, 'kg', 'device', 'lafkigafk');`,
    );
}

writeFileSync(out, lines.join("\n") + "\n");
console.log(`Wrote ${out}: ${data.length} weigh-ins, ${lines.length} lines`);
