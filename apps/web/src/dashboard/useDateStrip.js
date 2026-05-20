import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "preact/hooks";

export const DATE_STRIP_PAGE = 30;
export const DATE_STRIP_FUTURE = 14;

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

function centerTodayColumn(sc, col) {
  if (!sc || !col) return;
  const left = col.offsetLeft + col.offsetWidth / 2 - sc.clientWidth / 2;
  sc.scrollLeft = Math.max(0, left);
}

/**
 * @param {string[]} knownDates
 * @param {{ active?: boolean }} [options] — when tab becomes active, re-center today
 */
export function useDateStrip(knownDates = [], options = {}) {
  const { active = true } = options;
  const today = localTodayISO();

  const dataMin = useMemo(() => {
    if (!knownDates.length) return addDaysISO(today, -(DATE_STRIP_PAGE - 1));
    return knownDates.reduce((m, d) => minISO(d, m), knownDates[0]);
  }, [knownDates, today]);

  const dataMax = useMemo(() => {
    const horizon = addDaysISO(today, DATE_STRIP_FUTURE);
    if (!knownDates.length) return horizon;
    const maxKnown = knownDates.reduce((m, d) => maxISO(d, m), knownDates[0]);
    return maxISO(maxKnown, horizon);
  }, [knownDates, today]);

  const defaultStart = useMemo(
    () => maxISO(dataMin, addDaysISO(today, -(DATE_STRIP_PAGE - 1))),
    [dataMin, today],
  );

  const defaultEnd = useMemo(() => addDaysISO(today, DATE_STRIP_FUTURE), [today]);

  const [windowStart, setWindowStart] = useState(defaultStart);
  const [windowEnd, setWindowEnd] = useState(defaultEnd);

  useEffect(() => {
    setWindowStart(maxISO(dataMin, addDaysISO(today, -(DATE_STRIP_PAGE - 1))));
    setWindowEnd(addDaysISO(today, DATE_STRIP_FUTURE));
  }, [today, dataMin]);

  const visibleDates = useMemo(
    () => rangeDates(windowStart, windowEnd),
    [windowStart, windowEnd],
  );

  const canLoadPast = windowStart > dataMin;

  const scrollRef = useRef(null);
  const todayColRef = useRef(null);
  const userScrolledRef = useRef(false);
  const loadingPastRef = useRef(false);
  const pendingScrollRef = useRef(null);

  const scrollToToday = useCallback(() => {
    userScrolledRef.current = false;
    const sc = scrollRef.current;
    const col = todayColRef.current;
    centerTodayColumn(sc, col);
  }, []);

  // Re-center when tab becomes visible again.
  useEffect(() => {
    if (!active) return;
    userScrolledRef.current = false;
  }, [active]);

  // Center today after layout (double rAF + resize while not user-scrolled).
  useLayoutEffect(() => {
    if (!active) return;
    const sc = scrollRef.current;
    const col = todayColRef.current;
    if (!sc || !col) return;

    let cancelled = false;
    const run = () => {
      if (cancelled || userScrolledRef.current) return;
      centerTodayColumn(sc, col);
    };

    run();
    const id = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });

    const ro = new ResizeObserver(() => {
      if (!userScrolledRef.current) run();
    });
    ro.observe(sc);

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [active, windowStart, windowEnd, visibleDates.length, today]);

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || !scrollRef.current) return;
    const sc = scrollRef.current;
    const delta = sc.scrollWidth - pending.width;
    sc.scrollLeft = pending.left + delta;
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
      const next = addDaysISO(ws, -DATE_STRIP_PAGE);
      return next < dataMin ? dataMin : next;
    });
  }, [canLoadPast, dataMin]);

  const onScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (sc.scrollLeft > 120) userScrolledRef.current = true;
    if (loadingPastRef.current || !canLoadPast) return;
    if (sc.scrollLeft < 96) loadMorePast();
  }, [canLoadPast, loadMorePast]);

  return {
    today,
    visibleDates,
    scrollRef,
    todayColRef,
    onScroll,
    canLoadPast,
    scrollToToday,
  };
}
