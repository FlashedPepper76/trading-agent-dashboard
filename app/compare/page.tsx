import { getRuns, getBenchmarkPrices, type Run } from "../../lib/supabase";
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

  // Date range anchor — use only agents with meaningful history so a brand-new
  // agent doesn't pull the VTI start date forward to today.
  const MIN_BENCHMARK_RUNS = 50;
  const anchorAgentIds = agentIds.filter((id) => (runsByAgent[id]?.length ?? 0) >= MIN_BENCHMARK_RUNS);
  const allRunTimes = (anchorAgentIds.length ? anchorAgentIds : agentIds)
    .flatMap((id) => (runsByAgent[id] ?? []).map((r) => new Date(r.run_at).getTime()))
    .filter((t) => Number.isFinite(t));
  const rangeStartMs = allRunTimes.length
    ? Math.min(...allRunTimes)
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rangeEndMs = Date.now();

  // Fetch VTI from Supabase (written by Plutus's snapshot via Alpaca).
  // Fallback to Yahoo Finance in case the table is empty on first deploy.
  const rangeStartDate = new Date(rangeStartMs).toISOString().slice(0, 10);
  let rawVTI: { date: string; close: number }[] = [];
  try {
    // Fetch 14 days of VTI before agent-launch so the benchmark line shows
  // meaningful shape rather than just 3 points over the agents' short history.
  const vtiFromDate = new Date(rangeStartMs - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  rawVTI = await getBenchmarkPrices("VTI", vtiFromDate);
  } catch {
    // Supabase failed or table empty — try Yahoo Finance as one-time fallback
    try {
      rawVTI = await fetchRangeSeries(
        "VTI",
        Math.floor(rangeStartMs / 1000) - 86400,
        Math.floor(rangeEndMs / 1000)
      );
    } catch {
      rawVTI = [];
    }
  }

  // Build the shared day-slot index from all dates that appear in any series.
  // Each calendar date gets equal horizontal width; runs within a day are
  // evenly spaced by count — no overnight diagonal straight-line artifacts.
  const allDateStrs = new Set<string>();
  for (const runs of Object.values(runsByAgent)) {
    for (const r of runs) if (r.account_equity != null) allDateStrs.add(r.run_at.slice(0, 10));
  }
  for (const p of rawVTI) allDateStrs.add(p.date.slice(0, 10));
  const daySlots = Array.from(allDateStrs).sort(); // ["2026-06-28", "2026-06-29", ...]
  const daySlotIndex: Record<string, number> = Object.fromEntries(daySlots.map((d, i) => [d, i]));
  const daySlotCount = daySlots.length || 1;

  const seriesByAgent = buildPerAgentPctSeries(runsByAgent, daySlotIndex, daySlotCount);
  const colors: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.accent]));
  const labels: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.label]));

  let benchmarkSeries: PctSeriesPoint[] = [];
  if (rawVTI.length >= 2) {
    benchmarkSeries = buildBenchmarkPctSeries(rawVTI, rangeStartMs, rangeEndMs, daySlotIndex, daySlotCount);
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640, marginBottom: 20 }}>
        Head-to-head — % return since each agent&apos;s first logged run. Each calendar day gets equal
        chart width so overnight gaps don&apos;t show as straight lines. Newer agents (like Hermes) start
        mid-chart at their actual start date. Total U.S. stock market (VTI) shown as a reference line.
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
          agentIds={agentIds}
          colors={colors}
          labels={labels}
          benchmarkSeries={benchmarkSeries}
          daySlots={daySlots}
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
