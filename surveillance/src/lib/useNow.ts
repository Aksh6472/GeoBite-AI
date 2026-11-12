"use client";

import { useEffect, useState } from "react";

/** Current time that re-renders every `ms`, so "last hour" windows stay current on an open page. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
