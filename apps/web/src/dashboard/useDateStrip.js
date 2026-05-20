import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "preact/hooks";

/** Days rendered on each side of today at first paint. */
export const DATE_STRIP_RADIUS = 15;
/** Days added when an edge sentinel enters the viewport. */
export const DATE_STRIP_CHUNK = 15;

/** @deprecated use DATE_STRIP_RADIUS */
export const DATE_STRIP_PAGE = DATE_STRIP_CHUNK;
/** @deprecated use DATE_STRIP_RADIUS */
export const DATE_STRIP_FUTURE = DATE_STRIP_RADIUS;

export function localTodayISO(tz = "Asia/Ho_Chi_Minh") {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function minISO(a, b) {
  return a < b ? a : b;
}

function maxISO(a, b) {
  return a > b ? a : b;
}

function rangeDates(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function instantCenterToday(sc, col) {
  if (!sc || !col) return;
  const prev = sc.style.scrollBehavior;
  sc.style.scrollBehavior = "auto";
  const left = col.offsetLeft + col.offsetWidth / 2 - sc.clientWidth / 2;
  sc.scrollLeft = Math.max(0, left);
  sc.style.scrollBehavior = prev;
}

/**
 * @param {string[]} knownDates
 * @param {{ active?: boolean }} [options]
 */
export function useDateStrip(knownDates = [], options = {}) {
  const { active = true } = options;
  const today = localTodayISO();

  const dataMin = useMemo(() => {
    if (!knownDates.length) return addDaysISO(today, -DATE_STRIP_RADIUS);
    return knownDates.reduce((m, d) => minISO(d, m), knownDates[0]);
  }, [knownDates, today]);

  const dataMax = useMemo(() => {
    const horizon = addDaysISO(today, DATE_STRIP_RADIUS);
    if (!knownDates.length) return horizon;
    const maxKnown = knownDates.reduce((m, d) => maxISO(d, m), knownDates[0]);
    return maxISO(maxKnown, horizon);
  }, [knownDates, today]);

  const initialStart = useMemo(() => maxISO(dataMin, addDaysISO(today, -DATE_STRIP_RADIUS)), [dataMin, today]);
  const initialEnd = useMemo(() => minISO(dataMax, addDaysISO(today, DATE_STRIP_RADIUS)), [dataMax, today]);

  const scrollRef = useRef(null);
  const todayColRef = useRef(null);
  const pastSentinelRef = useRef(null);
  const futureSentinelRef = useRef(null);
  const userScrolledRef = useRef(false);
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const pendingScrollRef = useRef(null);
  const instantCenteredRef = useRef(false);

  const [windowStart, setWindowStart] = useState(initialStart);
  const [windowEnd, setWindowEnd] = useState(initialEnd);

  // Calendar day rolled over — re-anchor strip around today.
  useEffect(() => {
    setWindowStart(maxISO(dataMin, addDaysISO(today, -DATE_STRIP_RADIUS)));
    setWindowEnd(minISO(dataMax, addDaysISO(today, DATE_STRIP_RADIUS)));
    userScrolledRef.current = false;
    instantCenteredRef.current = false;
  }, [today, dataMin, dataMax]);

  const visibleDates = useMemo(
    () => rangeDates(windowStart, windowEnd),
    [windowStart, windowEnd],
  );

  const canLoadPast = windowStart > dataMin;
  const canLoadFuture = windowEnd < dataMax;

  const scrollToToday = useCallback(() => {
    userScrolledRef.current = false;
    instantCenteredRef.current = false;
    instantCenterToday(scrollRef.current, todayColRef.current);
    instantCenteredRef.current = true;
  }, []);

  useEffect(() => {
    if (!active) return;
    userScrolledRef.current = false;
    instantCenteredRef.current = false;
  }, [active]);

  // One-shot instant center when tab opens (no smooth scroll, no resize loop).
  useLayoutEffect(() => {
    if (!active || userScrolledRef.current || instantCenteredRef.current) return;
    if (pendingScrollRef.current) return;
    const sc = scrollRef.current;
    const col = todayColRef.current;
    if (!sc || !col) return;
    instantCenterToday(sc, col);
    instantCenteredRef.current = true;
  }, [active, today, windowStart, windowEnd, visibleDates.length]);

  // Preserve scroll position when prepending past days.
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || !scrollRef.current) return;
    const sc = scrollRef.current;
    const prev = sc.style.scrollBehavior;
    sc.style.scrollBehavior = "auto";
    const delta = sc.scrollWidth - pending.width;
    sc.scrollLeft = pending.left + delta;
    sc.style.scrollBehavior = prev;
    pendingScrollRef.current = null;
    loadingPastRef.current = false;
  }, [windowStart]);

  const loadMorePast = useCallback(() => {
    if (!canLoadPast || loadingPastRef.current) return;
    const sc = scrollRef.current;
    if (!sc) return;
    loadingPastRef.current = true;
    pendingScrollRef.current = { width: sc.scrollWidth, left: sc.scrollLeft };
    setWindowStart((ws) => {
      const next = addDaysISO(ws, -DATE_STRIP_CHUNK);
      return next < dataMin ? dataMin : next;
    });
  }, [canLoadPast, dataMin]);

  const loadMoreFuture = useCallback(() => {
    if (!canLoadFuture || loadingFutureRef.current) return;
    loadingFutureRef.current = true;
    setWindowEnd((we) => {
      const next = addDaysISO(we, DATE_STRIP_CHUNK);
      return next > dataMax ? dataMax : next;
    });
    loadingFutureRef.current = false;
  }, [canLoadFuture, dataMax]);

  // Load ±CHUNK when edge sentinel enters viewport (not on every scroll tick).
  useEffect(() => {
    const root = scrollRef.current;
    const past = pastSentinelRef.current;
    const future = futureSentinelRef.current;
    if (!active || !root) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === past) loadMorePast();
          if (e.target === future) loadMoreFuture();
        }
      },
      { root, threshold: 0, rootMargin: "48px" },
    );

    if (past) io.observe(past);
    if (future) io.observe(future);
    return () => io.disconnect();
  }, [active, loadMorePast, loadMoreFuture, windowStart, windowEnd]);

  const onScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (sc.scrollLeft > 80) userScrolledRef.current = true;
  }, []);

  return {
    today,
    visibleDates,
    scrollRef,
    todayColRef,
    pastSentinelRef,
    futureSentinelRef,
    onScroll,
    canLoadPast,
    canLoadFuture,
    scrollToToday,
  };
}
