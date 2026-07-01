"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function EquityRefresher() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setLastRefreshed(new Date());
    setTimeout(() => setRefreshing(false), 800);
  }

  // Auto-refresh every 60s while the tab is open
  useEffect(() => {
    timerRef.current = setInterval(refresh, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const timeStr = lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
        updated {timeStr}
      </span>
      <button
        onClick={refresh}
        title="Refresh equity data"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 999,
          padding: "4px 10px",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          transition: "color 0.15s var(--ease)",
        }}
      >
        <RefreshCw
          size={12}
          strokeWidth={2.5}
          style={{
            transition: "transform 0.5s ease",
            transform: refreshing ? "rotate(360deg)" : "none",
          }}
        />
        Refresh
      </button>
    </div>
  );
}
