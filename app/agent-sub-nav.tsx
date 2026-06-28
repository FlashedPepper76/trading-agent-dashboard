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

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 20,
        padding: 4,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 999,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            style={{
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
              background: isActive ? agent.accent : "transparent",
              fontWeight: isActive ? 600 : 400,
              transition: "background 0.2s var(--ease), color 0.2s var(--ease)",
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
