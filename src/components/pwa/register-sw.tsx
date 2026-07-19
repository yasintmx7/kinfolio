"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Force check so phones drop old cache-first SW that served stale market UI
        void reg.update();
      })
      .catch(() => {
        // ignore registration failures
      });
  }, []);
  return null;
}
