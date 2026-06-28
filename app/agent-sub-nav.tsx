import Link from "next/link";
import { AGENTS, type AgentId } from "../lib/agents";

export default function AgentSubNav({ id, active }: { id: AgentId; active: "log" | "positions" | "brief" }) {
  const agent = AGENTS[id];
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: "log", label: "Log", href: `/agent/${id}` },
    { key: "positions", label: "Positions", href: `/agent/${id}/positions` },
    { key: "brief", label: "Brief", href: `/agent/${id}/instructions` },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 20,
        borderBottom: "1px solid var(--border-hairline)",
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
              textAlign: "center",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              letterSpacing: "0.03em",
              padding: "9px 4px",
              color: isActive ? agent.accent : "var(--text-muted)",
              borderBottom: isActive ? `2px solid ${agent.accent}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab.label.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
