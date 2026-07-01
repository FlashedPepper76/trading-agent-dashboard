import { getRuns, type Run } from "../../lib/supabase";
import { getAllAgents, type AgentMeta } from "../../lib/agents";
import { fmtTime } from "../run-helpers";
import {
  computeAgentStats,
  capRejectionBreakdown,
  buildPerAgentPctSeries,
  buildBenchmarkPctSeries,
  fmtPct,
  type PctSeriesPoint,
} from "./compare-helpers";
import { DualReturnChart } from "./DualReturnChartClient";
import { fetchRangeSeries } from "../../lib/quotes";

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

function AgentStatsColumn({ agent, runs }: { agent: AgentMeta; runs: Run[] }) {
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
  const agents = await getAllAgents();
  const results = await Promise.all(
    agents.map(async (agent) => {
      try {
        const runs = await getRuns(2000, undefined, agent.id);
        return { agent, runs, loadError: null as string | null };
      } catch (e) {
        return { agent, runs: [] as Run[], loadError: e instanceof Error ? e.message : "Unknown error" };
      }
    })
  );

  const runsByAgent: Record<string, Run[]> = {};
  for (const { agent, runs } of results) runsByAgent[agent.id] = runs;

  const agentIds = agents.map((a) => a.id);

  // Agents need a minimum run history before their line is meaningful on
  // the return chart — a 20-run line spreads 20 points across the same
  // visual width as a 200-run line, looks flat, and skews the y-axis.
  // 50 runs ≈ 1–2 days of 15-min polling; any agent below this threshold
  // is shown in the stats cards but excluded from the chart until it
  // accumulates enough history. No code change needed when it crosses the
  // threshold — the chart just starts including it automatically.
  const MIN_CHART_RUNS = 50;
  const chartAgentIds = agentIds.filter((id) => (runsByAgent[id]?.length ?? 0) >= MIN_CHART_RUNS);

  const seriesByAgent = buildPerAgentPctSeries(
    Object.fromEntries(chartAgentIds.map((id) => [id, runsByAgent[id]]))
  );
  const colors: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.accent]));
  const labels: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.label]));

  // Date range uses only chart-eligible agents so a brand-new agent
  // doesn't anchor VTI to today instead of when the established agents started.
  const allRunTimes = chartAgentIds
    .flatMap((id) => (runsByAgent[id] ?? []).map((r) => new Date(r.run_at).getTime()))
    .filter((t) => Number.isFinite(t));
  const rangeStartMs = allRunTimes.length
    ? Math.min(...allRunTimes)
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rangeEndMs = Date.now();

  let benchmarkSeries: PctSeriesPoint[] = [];
  try {
    // VTI tracks the entire U.S. stock market (~3,600+ companies), not just
    // the S&P 500's large-caps — a closer match to "stocks in general."
    const raw = await fetchRangeSeries(
      "VTI",
      Math.floor(rangeStartMs / 1000) - 86400,
      Math.floor(rangeEndMs / 1000)
    );
    benchmarkSeries = buildBenchmarkPctSeries(raw, rangeStartMs, rangeEndMs);
  } catch {
    // If Yahoo's endpoint is unreachable or rate-limited, just skip the
    // benchmark line rather than breaking the whole compare page.
    benchmarkSeries = [];
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640, marginBottom: 20 }}>
        Head-to-head — % return since each agent&apos;s first logged run, same chart as the home-screen widget
        (each agent plotted across its own run history, oldest to latest), with the total U.S. stock market
        (VTI) over the same stretch of calendar time as a reference line — so a dip is easier to tell apart
        from an agent just making bad calls.
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
        <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
          {agents.map((agent) => (
            <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: agent.accent }} />
              <span style={{ color: "var(--text-muted)" }}>{agent.label}</span>
            </div>
          ))}
          {benchmarkSeries.length >= 2 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <svg width="14" height="10" style={{ flexShrink: 0 }}>
                <line x1="0" y1="5" x2="14" y2="5" stroke="var(--accent-benchmark)" strokeWidth="2" strokeDasharray="3,2" />
              </svg>
              <span style={{ color: "var(--text-muted)" }}>Total market (VTI)</span>
            </div>
          ) : null}
        </div>
        <DualReturnChart
          seriesByAgent={seriesByAgent}
          agentIds={chartAgentIds}
          colors={colors}
          labels={labels}
          benchmarkSeries={benchmarkSeries}
        />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {results.map(({ agent, runs }) => (
          <AgentStatsColumn key={agent.id} agent={agent} runs={runs} />
        ))}
      </div>
    </div>
  );
}

