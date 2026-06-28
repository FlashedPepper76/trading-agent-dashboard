"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotifyBell from "./notify-bell";
import { AGENTS, AGENT_IDS } from "../lib/agents";

export default function Nav() {
  const pathname = usePathname();

  const linkStyle = (active: boolean, accent?: string): React.CSSProperties => ({
    textDecoration: "none",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    letterSpacing: "0.04em",
    padding: "6px 12px",
    borderRadius: 6,
    color: active ? accent || "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-surface-2)" : "transparent",
    border: active ? "1px solid var(--border-hairline)" : "1px solid transparent",
  });

  return (
    <header
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "28px 20px 20px",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/icon-192.png" alt="" width={28} height={28} style={{ borderRadius: 7, flexShrink: 0 }} />
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: "-0.01em",
            }}
          >
            Trading Agents
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
            paper trading — simulated funds only
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <NotifyBell />
        <nav style={{ display: "flex", gap: 6 }}>
          <Link href="/" style={linkStyle(pathname === "/")}>
            OVERVIEW
          </Link>
          <Link href="/compare" style={linkStyle(pathname === "/compare")}>
            COMPARE
          </Link>
          {AGENT_IDS.map((id) => (
            <Link
              key={id}
              href={`/agent/${id}`}
              style={linkStyle(pathname.startsWith(`/agent/${id}`), AGENTS[id].accent)}
            >
              {AGENTS[id].label.toUpperCase()}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
