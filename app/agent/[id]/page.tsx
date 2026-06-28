import Link from "next/link";
import { notFound } from "next/navigation";
import { getRuns, type Run } from "../../../lib/supabase";
import { AGENTS, isAgentId } from "../../../lib/agents";
import { runHasTrade, SummaryBar, RunEntry } from "../../run-helpers";

export default async function AgentLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onlyTrades?: string; show?: string }>;
}) {
  const { id } = await params;
  if (!isAgentId(id)) notFound();
  const agent = AGENTS[id];

  const sp = await searchParams;
  const onlyTrades = sp.onlyTrades === "1";
  const showCount = Math.max(10, parseInt(sp.show || "30", 10) || 30);

  let allRuns: Run[] = [];
  let loadError: string | null = null;

  try {
    allRuns = await getRuns(500, undefined, id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const filtered = onlyTrades ? allRuns.filter(runHasTrade) : allRuns;
  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  const toggleHref = `/agent/${id}?onlyTrades=${onlyTrades ? "0" : "1"}`;
  const showMoreHref = `/agent/${id}?onlyTrades=${onlyTrades ? "1" : "0"}&show=${showCount + 30}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
            {agent.label}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
        </div>
        <Link
          href={`/agent/${id}/instructions`}
          style={{
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-muted)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 6,
            padding: "6px 10px",
            whiteSpace: "nowrap",
          }}
        >
          edit brief →
        </Link>
      </div>

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load the log: {loadError}</div>
      ) : allRuns.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "40px 0" }}>
          No runs logged yet for {agent.label}. Once it runs, entries will show up here — newest first.
        </div>
      ) : (
        <>
          <SummaryBar runs={allRuns} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              showing {visible.length} of {filtered.length}
              {onlyTrades ? " runs with trades" : " runs"}
            </span>
            <a
              href={toggleHref}
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: onlyTrades ? agent.accent : "var(--text-muted)",
                textDecoration: "none",
                border: "1px solid var(--border-hairline)",
                borderRadius: 6,
                padding: "4px 10px",
              }}
            >
              {onlyTrades ? "✓ only trades" : "show only trades"}
            </a>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
              No runs with executed trades yet.
            </div>
          ) : (
            visible.map((run) => <RunEntry key={run.id} run={run} />)
          )}

          {hasMore ? (
            <a
              href={showMoreHref}
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
                textDecoration: "none",
                border: "1px solid var(--border-hairline)",
                borderRadius: 8,
                padding: "10px 0",
                marginTop: 8,
              }}
            >
              Show more (+30)
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
