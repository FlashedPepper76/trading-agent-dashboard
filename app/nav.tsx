"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ArrowLeftRight, Zap, ShieldCheck, Bot, type LucideIcon } from "lucide-react";
import NotifyBell from "./notify-bell";
import type { AgentMeta } from "../lib/agents";

type NavItem = { href: string; label: string; icon: LucideIcon; accent?: string; match: (p: string) => boolean };

// Known hardcoded agents get a distinct icon; anything dynamic (or any
// future hardcoded agent that forgets to add one here) falls back to a
// generic bot icon rather than breaking.
const AGENT_ICONS: Record<string, LucideIcon> = { plutus: Zap, helios: ShieldCheck };

function buildItems(agents: AgentMeta[]): NavItem[] {
  return [
    { href: "/", label: "Overview", icon: LayoutGrid, match: (p) => p === "/" },
    { href: "/compare", label: "Compare", icon: ArrowLeftRight, match: (p) => p === "/compare" },
    ...agents.map((agent) => ({
      href: `/agent/${agent.id}`,
      label: agent.label,
      icon: AGENT_ICONS[agent.id] || Bot,
      accent: agent.accent,
      match: (p: string) => p.startsWith(`/agent/${agent.id}`),
    })),
  ];
}

export default function Nav({ agents }: { agents: AgentMeta[] }) {
  const pathname = usePathname();
  const items = buildItems(agents);

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          padding: "16px 20px",
          background: "color-mix(in srgb, var(--bg-base) 88%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-hairline)",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
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
                  fontSize: 18,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                Trading Agents
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>paper trading — simulated funds</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Desktop/tablet nav — hidden on phones in favor of the bottom tab bar. */}
            <nav className="desktop-nav" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {items.map((item) => {
                const isActive = item.match(pathname);
                const color = isActive ? item.accent || "var(--text-primary)" : "var(--text-muted)";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      textDecoration: "none",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      letterSpacing: "0.02em",
                      padding: "7px 12px",
                      borderRadius: 999,
                      color,
                      background: isActive ? "var(--bg-surface-2)" : "transparent",
                      border: isActive ? "1px solid var(--border-hairline)" : "1px solid transparent",
                      transition: "background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease)",
                    }}
                  >
                    <item.icon size={14} strokeWidth={2.25} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <NotifyBell />
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — fixed, app-like, replaces the desktop nav row
          below the 520px breakpoint (see .mobile-tabbar in globals.css). */}
      <nav className="mobile-tabbar">
        {items.map((item) => {
          const isActive = item.match(pathname);
          const color = isActive ? item.accent || "var(--accent-focus)" : "var(--text-faint)";
          return (
            <Link key={item.href} href={item.href} className="mobile-tabbar-item" style={{ color }}>
              <item.icon
                size={20}
                strokeWidth={2.25}
                style={{ transform: isActive ? "translateY(-1px) scale(1.05)" : "none", transition: "transform 0.18s var(--ease)" }}
              />
              <span style={{ fontSize: 10.5, letterSpacing: "0.01em" }}>{item.label}</span>
              {isActive ? <span className="mobile-tabbar-dot" style={{ background: color }} /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
