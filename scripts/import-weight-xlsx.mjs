#!/usr/bin/env node
/**
 * Import body-composition scale export (.xlsx) → body_metrics + days.weight_kg
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
 *   node scripts/import-weight-xlsx.mjs "/path/to/export.xlsx"
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error("Usage: node scripts/import-weight-xlsx.mjs /path/to/export.xlsx");
  process.exit(1);
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseXlsx(path) {
  const tmp = "/tmp/schedule-xlsx-import";
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
      const col = cm[1];
      const t = cm[3];
      let val = cm[4];
      if (t.includes('t="s"') && val) val = strings[+val];
      cells.push({ col, val });
    }
    if (cells.length) rows.push(cells);
  }

  let colMap = {};
  for (const cells of rows) {
    const vals = cells.map((c) => c.val);
    if (vals.includes("Weight(Kg)")) {
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
        ? String(timeRaw).padStart(5, "0") + ":00"
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

  data.sort((a, b) =>
    `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`),
  );
  return data;
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: init.method === "GET" ? "return=representation" : "return=minimal",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

async function ensureDay(date) {
  await rest("days", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ date }),
  }).catch(() => {});
}

async function insertMetric(row) {
  await rest("body_metrics", {
    method: "POST",
    body: JSON.stringify(row),
  });
}

async function main() {
  if (!existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }
  if (!URL || !KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const rows = parseXlsx(xlsxPath);
  console.log(`Parsed ${rows.length} weigh-ins from ${xlsxPath}`);

  const latestByDay = new Map();
  for (const r of rows) {
    latestByDay.set(r.date, r.weight);
  }

  let n = 0;
  for (const r of rows) {
    await ensureDay(r.date);
    const base = {
      date: r.date,
      time: r.time,
      source_type: "device",
      notes: "lafkigafk import",
    };
    await insertMetric({ ...base, metric: "weight_kg", value: r.weight, unit: "kg" });
    n++;
    if (r.bf != null && Number.isFinite(r.bf)) {
      await insertMetric({ ...base, metric: "bf_pct", value: r.bf, unit: "%" });
      n++;
    }
    if (r.fatMass != null && Number.isFinite(r.fatMass)) {
      await insertMetric({ ...base, metric: "fat_mass_kg", value: r.fatMass, unit: "kg" });
      n++;
    }
    if (r.muscle != null && Number.isFinite(r.muscle)) {
      await insertMetric({ ...base, metric: "muscle_mass_kg", value: r.muscle, unit: "kg" });
      n++;
    }
  }

  for (const [date, weight] of latestByDay) {
    await rest(`days?date=eq.${date}`, {
      method: "PATCH",
      body: JSON.stringify({ weight_kg: weight }),
    });
  }

  console.log(`Done: ${n} body_metrics rows, ${latestByDay.size} days.weight_kg updated`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
