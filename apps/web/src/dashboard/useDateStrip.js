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

/**
 * Horizontal date strip: past ← today → future.
 * Initially renders ~30 days ending at today + future buffer.
 * Scrolling to the left edge prepends another page of older days.
 */
export function useDateStrip(knownDates = []) {
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
  }, [today, dataMin, defaultEnd]);

  const visibleDates = useMemo(
    () => rangeDates(windowStart, windowEnd),
    [windowStart, windowEnd],
  );

  const canLoadPast = windowStart > dataMin;

  const scrollRef = useRef(null);
  const todayColRef = useRef(null);
  const didScrollToToday = useRef(false);
  const loadingPastRef = useRef(false);
  const pendingScrollRef = useRef(null);

  const scrollToToday = useCallback(() => {
    const sc = scrollRef.current;
    const col = todayColRef.current;
    if (!sc || !col) return;
    sc.scrollLeft = col.offsetLeft - sc.clientWidth / 2 + col.clientWidth / 2;
  }, []);

  useEffect(() => {
    didScrollToToday.current = false;
  }, [today]);

  useEffect(() => {
    if (didScrollToToday.current) return;
    if (!scrollRef.current || !todayColRef.current) return;
    scrollToToday();
    didScrollToToday.current = true;
  }, [visibleDates.length, scrollToToday]);

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
    if (!sc || loadingPastRef.current || !canLoadPast) return;
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
