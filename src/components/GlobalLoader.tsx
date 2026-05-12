import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * GlobalLoader — a modern top progress bar that animates while:
 *  - any fetch() / supabase request is in flight
 *  - the router is navigating between pages
 *
 * Mounted once in __root.tsx, no consumer setup needed.
 */
let inflight = 0;
const listeners = new Set<(n: number) => void>();
function setInflight(n: number) {
  inflight = Math.max(0, n);
  listeners.forEach((l) => l(inflight));
}

let patched = false;
function patchFetch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    setInflight(inflight + 1);
    try {
      return await orig(...args);
    } finally {
      // small delay so quick calls still flash the bar nicely
      setTimeout(() => setInflight(inflight - 1), 60);
    }
  };
}

export function GlobalLoader() {
  const [count, setCount] = useState(0);
  const routerState = useRouterState({ select: (s) => s.status });
  const navigating = routerState !== "idle";
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    patchFetch();
    const cb = (n: number) => setCount(n);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const active = count > 0 || navigating;

  useEffect(() => {
    if (active) {
      setVisible(true);
      setProgress((p) => (p < 10 ? 15 : p));
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          // ease towards 90
          return p + Math.max(0.5, (90 - p) * 0.08);
        });
      }, 200);
    } else {
      if (timer.current) window.clearInterval(timer.current);
      setProgress(100);
      const t = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350);
      return () => window.clearTimeout(t);
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [active]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
      style={{ height: 3, opacity: visible ? 1 : 0, transition: "opacity 250ms ease" }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease-out",
          background:
            "linear-gradient(90deg, #6C63FF 0%, #9B59B6 40%, #F5A623 80%, #FFD27A 100%)",
          boxShadow:
            "0 0 14px 0 rgba(108,99,255,0.65), 0 0 4px 0 rgba(245,166,35,0.6)",
          borderRadius: 2,
        }}
      />
      {/* shimmer */}
      <div
        className="h-full -mt-[3px]"
        style={{
          width: `${progress}%`,
          maskImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
          background: "rgba(255,255,255,0.35)",
          animation: visible ? "psl-shimmer 1.4s linear infinite" : "none",
        }}
      />
      <style>{`
        @keyframes psl-shimmer {
          0% { transform: translateX(-30%); }
          100% { transform: translateX(30%); }
        }
      `}</style>
    </div>
  );
}
