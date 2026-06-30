"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScrollText, Wallet, FileText } from "lucide-react";
import { AGENTS, type AgentId } from "../lib/agents";

export default function AgentSubNav({ id, active }: { id: AgentId; active: "log" | "positions" | "brief" }) {
  const agent = AGENTS[id];
  const tabs = [
    { key: "log" as const, label: "Log", href: `/agent/${id}`, icon: ScrollText },
    { key: "positions" as const, label: "Positions", href: `/agent/${id}/positions`, icon: Wallet },
    { key: "brief" as const, label: "Brief", href: `/agent/${id}/instructions`, icon: FileText },
  ];
  const activeIndex = tabs.findIndex((t) => t.key === active);

  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);

  // Measure the active tab's pill so the indicator can slide via transform
  // (GPU-only) instead of animating left/width directly.
  useLayoutEffect(() => {
    const el = tabRefs.current[activeIndex];
    if (el) setIndicator({ x: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex]);

  // Re-measure on resize/font-load since tab widths depend on layout.
  useEffect(() => {
    function measure() {
      const el = tabRefs.current[activeIndex];
      if (el) setIndicator({ x: el.offsetLeft, width: el.offsetWidth });
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        gap: 4,
        marginBottom: 20,
        padding: 4,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 999,
      }}
    >
      {indicator ? (
        <div
          className="subnav-indicator"
          style={{
            transform: `translateX(${indicator.x - 4}px)`,
            width: indicator.width,
            background: agent.accent,
          }}
        />
      ) : null}

      {tabs.map((tab, i) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            href={tab.href}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              textAlign: "center",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              letterSpacing: "0.02em",
              padding: "8px 4px",
              borderRadius: 999,
              color: isActive ? "#0a0c10" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 400,
              transition: "color 0.18s var(--ease)",
            }}
          >
            <tab.icon size={13} strokeWidth={2.25} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
