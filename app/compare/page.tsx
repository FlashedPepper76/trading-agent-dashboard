import { getRuns, type Run } from "../../lib/supabase";
import { AGENTS, AGENT_IDS, type AgentId } from "../../lib/agents";
import { fmtTime } from "../run-helpers";
import {
  computeAgentStats,
  capRejectionBreakdown,
  buildPerAgentPctSeries,
  fmtPct,
} from "./compare-helpers";
import { DualReturnChart } from "./DualReturnChartClient";

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border-hairline)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span style={{ color: color || "var(--text-primary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function AgentStatsColumn({ id, runs }: { id: AgentId; runs: Run[] }) {
  const agent = AGENTS[id];
  const stats = computeAgentStats(runs);
  const rejections = capRejectionBreakdown(runs);
  const returnColor =
    stats.totalReturnPct == null || stats.totalReturnPct === 0
      ? "var(--text-primary)"
      : stats.totalReturnPct > 0
        ? "var(--accent-buy)"
        : "var(--accent-sell)";

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        flex: 1,
        minWidth: 240,
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: agent.accent }}>
        {agent.label}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2, marginBottom: 14 }}>{agent.tagline}</div>

      <StatRow label="Total return" value={fmtPct(stats.totalReturnPct)} color={returnColor} />
      <StatRow label="Max drawdown" value={fmtPct(stats.maxDrawdownPct)} />
      <StatRow
        label="Win rate"
        value={stats.closedTradeCount ? `${stats.winRate!.toFixed(0)}% (${stats.closedTradeCount} closed)` : "no closes yet"}
      />
      <StatRow label="Trades executed" value={String(stats.tradeCount)} />
      <StatRow label="Cap rejections" value={String(stats.capRejectionCount)} />
      <StatRow label="Last run" value={stats.lastRunAt ? fmtTime(stats.lastRunAt) : "—"} />

      {rejections.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 6 }}>
            REJECTION REASONS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rejections.map(({ reason, count }) => (
              <div
                key={reason}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                <span>{reason}</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function ComparePage() {
  const results = await Promise.all(
    AGENT_IDS.map(async (id) => {
      try {
        const runs = await getRuns(2000, undefined, id);
        return { id, runs, loadError: null as string | null };
      } catch (e) {
        return { id, runs: [] as Run[], loadError: e instanceof Error ? e.message : "Unknown error" };
      }
    })
  );

  const runsByAgent: Record<string, Run[]> = {};
  for (const { id, runs } of results) runsByAgent[id] = runs;

  const seriesByAgent = buildPerAgentPctSeries(runsByAgent);
  const colors: Record<string, string> = {
    plutus: "var(--accent-buy)",
    helios: "var(--accent-helios)",
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640, marginBottom: 20 }}>
        Plutus vs Helios, head-to-head — % return since each agent&apos;s first logged run, same chart as the
        home-screen widget (each agent plotted across its own run history, oldest to latest).
      </p>

      <div
        className="card"
        style={{
          border: "1px solid var(--border-hairline)",
          borderRadius: 12,
          padding: 18,
          background: "var(--bg-surface)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
          {AGENT_IDS.map((id) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: AGENTS[id].accent }} />
              <span style={{ color: "var(--text-muted)" }}>{AGENTS[id].label}</span>
            </div>
          ))}
        </div>
        <DualReturnChart seriesByAgent={seriesByAgent} agentIds={AGENT_IDS} colors={colors} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {results.map(({ id, runs }) => (
          <AgentStatsColumn key={id} id={id} runs={runs} />
        ))}
      </div>
    </div>
  );
}
