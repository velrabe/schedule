// Runnable check for auto sleep calc + wake inference. `node dayWakeTimeline.selfcheck.mjs`.
import assert from "node:assert/strict";
import {
  computeDisplaySleepHours,
  inferWakeClock,
  effectiveWakeClock,
  dayWakeChronoMinutes,
} from "./dayWakeTimeline.js";

// Real phase shapes from the log.
// July 1: evening wake, night runs past midnight → wake must be 19:30, not the
// past-midnight «Ночной блок».
const jul1 = [
  { date: "2026-07-01", start: "19:30", end: "20:20" },
  { date: "2026-07-01", start: "20:20", end: "01:25" },
  { date: "2026-07-01", start: "01:25", end: "04:35" },
];
assert.equal(inferWakeClock("2026-07-01", jul1), "19:30", "evening wake mis-inferred");

// July 2: continuous night «без пробуждения», day starts before dawn at 04:35.
// The old fixed 06:00 anchor shoved this block to the bottom (the "upside-down"
// calendar). Inference must return 04:35 so it sorts first.
const jul2 = [
  { date: "2026-07-02", start: "04:35", end: "14:10" },
  { date: "2026-07-02", start: "14:10", end: "15:30" },
  { date: "2026-07-02", start: "15:30", end: "19:00" },
  { date: "2026-07-02", start: "19:00", end: "22:00" },
  { date: "2026-07-02", start: "23:00", end: "03:30" },
];
assert.equal(inferWakeClock("2026-07-02", jul2), "04:35", "pre-dawn wake mis-inferred");

// Calendar ordering: the 04:35 block sorts first, not last.
const wake = effectiveWakeClock({ date: "2026-07-02", wake: "" }, "2026-07-02", jul2);
const order = [...jul2]
  .sort((a, b) => dayWakeChronoMinutes(a.start, wake) - dayWakeChronoMinutes(b.start, wake))
  .map((s) => s.start);
assert.deepEqual(order, ["04:35", "14:10", "15:30", "19:00", "23:00"], `bad order: ${order}`);

// Explicit wake/отбой still wins over inference.
assert.equal(
  computeDisplaySleepHours(
    { date: "2026-07-02", wake: "11:00", sleep_start: "" },
    { date: "2026-07-01", wake: "", sleep_start: "01:00" },
    [],
  ),
  10,
  "explicit отбой→подъём broke",
);

// Session-only fallback: bed = prev latest end, rise = inferred wake.
const sleepSessions = [
  { date: "2026-07-01", start: "20:00", end: "23:00" },
  { date: "2026-07-01", start: "23:00", end: "02:00" }, // bed 02:00
  { date: "2026-07-02", start: "00:50", end: "01:30" }, // tail, not the wake
  { date: "2026-07-02", start: "14:30", end: "16:00" }, // wake
  { date: "2026-07-02", start: "16:00", end: "18:00" },
];
assert.equal(
  computeDisplaySleepHours(
    { date: "2026-07-02", wake: "", sleep_start: "", sleep_h: null },
    { date: "2026-07-01", wake: "", sleep_start: "", sleep_h: null },
    sleepSessions,
  ),
  12.5,
  "auto sleep from sessions broke",
);

console.log("dayWakeTimeline selfcheck OK");
