import type { Run } from "../../lib/supabase";

// order_status values that represent a genuine risk-cap rejection, as
// opposed to a plain hold or a successfully executed order. cap_note gets
// folded into order_status before it's ever written (see ai_agent.py
// _log_decisions), so this is the only field that ever needs checking.
const CAP_REASONS = new Set([
  "max open positions reached",
  "max new buys per run reached",
  "insufficient free cash after buffer",
  "no position held to sell",
  "already held, ignoring duplicate buy",
  "a buy order for this symbol is already pending/unfilled, ignoring duplicate",
  "duplicate buy for this symbol already approved this run, ignoring",
  "no price data available for this symbol this run",
  "symbol not in approved universe",
]);

export type AgentStats = {
  startingEquity: number | null;
  currentEquity: number | null;
  totalReturnPct: number | null;
  maxDrawdownPct: number;
  tradeCount: number;
  closedTradeCount: number;
  winRate: number | null;
  capRejectionCount: number;
  lastRunAt: string | null;
};

// `runs` comes from getRuns(), which returns newest-first.
export function computeAgentStats(runs: Run[]): AgentStats {
  if (runs.length === 0) {
    return {
      startingEquity: null,
      currentEquity: null,
      totalReturnPct: null,
      maxDrawdownPct: 0,
      tradeCount: 0,
      closedTradeCount: 0,
      winRate: null,
      capRejectionCount: 0,
      lastRunAt: null,
    };
  }

  const chronological = [...runs].reverse();
  const equitySeries = chronological
    .map((r) => r.account_equity)
    .filter((v): v is number => v !== null);

  const startingEquity = equitySeries[0] ?? null;
  const currentEquity = equitySeries[equitySeries.length - 1] ?? null;
  const totalReturnPct =
    startingEquity && currentEquity ? ((currentEquity - startingEquity) / startingEquity) * 100 : null;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const equity of equitySeries) {
    peak = Math.max(peak, equity);
    if (peak > 0) {
      const dd = ((equity - peak) / peak) * 100;
      if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    }
  }

  const decisions = runs.flatMap((r) => r.trading_agent_decisions || []);
  const closedTrades = decisions.filter(
    (d) => d.action === "sell" && d.order_id && d.realized_pnl_pct != null
  );
  const wins = closedTrades.filter((d) => Number(d.realized_pnl_pct) > 0).length;
  const winRate = closedTrades.length ? (wins / closedTrades.length) * 100 : null;

  const tradeCount = decisions.filter((d) => d.order_id).length;
  const capRejectionCount = decisions.filter(
    (d) => d.order_status && CAP_REASONS.has(d.order_status)
  ).length;

  return {
    startingEquity,
    currentEquity,
    totalReturnPct,
    maxDrawdownPct,
    tradeCount,
    closedTradeCount: closedTrades.length,
    winRate,
    capRejectionCount,
    lastRunAt: runs[0].run_at,
  };
}

export type CapRejectionReason = { reason: string; count: number };

export function capRejectionBreakdown(runs: Run[]): CapRejectionReason[] {
  const counts = new Map<string, number>();
  for (const d of runs.flatMap((r) => r.trading_agent_decisions || [])) {
    if (!d.order_status || !CAP_REASONS.has(d.order_status)) continue;
    counts.set(d.order_status, (counts.get(d.order_status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export type AlignedPoint = { date: string; pctByAgent: Record<string, number | null> };

// Daily-bucketed, forward-filled % return per agent, aligned onto a shared
// date axis — needed because Plutus runs every minute and Helios runs once
// a day, so their raw run timestamps never line up. (Used elsewhere; the
// compare chart itself now uses buildPerAgentPctSeries below to match the
// home-screen widget's own chart, which doesn't align by date.)
export function buildAlignedReturnSeries(runsByAgent: Record<string, Run[]>): AlignedPoint[] {
  const dailyByAgent: Record<string, { byDate: Map<string, number>; start: number | null }> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse();
    const byDate = new Map<string, number>();
    for (const r of chronological) {
      if (r.account_equity == null) continue;
      byDate.set(r.run_at.slice(0, 10), r.account_equity); // last value per date wins
    }
    const firstEquity = chronological.find((r) => r.account_equity != null)?.account_equity ?? null;
    dailyByAgent[agentId] = { byDate, start: firstEquity };
  }

  const allDates = Array.from(
    new Set(Object.values(dailyByAgent).flatMap((a) => Array.from(a.byDate.keys())))
  ).sort();

  const lastKnownPct: Record<string, number | null> = {};
  return allDates.map((date) => {
    const pctByAgent: Record<string, number | null> = {};
    for (const [agentId, a] of Object.entries(dailyByAgent)) {
      const equity = a.byDate.get(date);
      if (equity != null && a.start) {
        lastKnownPct[agentId] = ((equity - a.start) / a.start) * 100;
      }
      pctByAgent[agentId] = lastKnownPct[agentId] ?? null;
    }
    return { date, pctByAgent };
  });
}

// xFrac is each point's horizontal position on the chart, 0..1. All series
// (agents and benchmark) now use the same calendar-time reference so that:
//  - A newer agent like Hermes (started today) correctly appears starting
//    partway across the chart rather than spanning the full width
//  - Tooltip dates are consistent across series at the same x position
//  - VTI aligns with the agent lines instead of being pinned to its own 0–1
export type PctSeriesPoint = { runAt: string; pct: number; xFrac: number };

// Calendar-time % return per agent. Each agent's line starts at the run_at
// timestamp of its first equity reading and ends at its last, both mapped
// onto the shared [rangeStartMs, rangeEndMs] time axis.
//
// Using calendar time (instead of the previous run-index fraction) means:
//  - Agents that started later appear starting mid-chart (correct)
//  - The x-axis dates shown from VTI or Plutus match what Hermes's
//    tooltip would report at the same horizontal position
export function buildPerAgentPctSeries(
  runsByAgent: Record<string, Run[]>,
  rangeStartMs: number,
  rangeEndMs: number
): Record<string, PctSeriesPoint[]> {
  const tSpan = rangeEndMs - rangeStartMs || 1;
  const result: Record<string, PctSeriesPoint[]> = {};
  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse().filter((r) => r.account_equity != null);
    const base = chronological[0]?.account_equity ?? null;
    result[agentId] = base
      ? chronological.map((r) => ({
          runAt: r.run_at,
          pct: ((r.account_equity! - base) / base) * 100,
          xFrac: Math.max(0, Math.min(1, (new Date(r.run_at).getTime() - rangeStartMs) / tSpan)),
        }))
      : [];
  }
  return result;
}

// Turns raw benchmark closes (e.g. VTI) into the same % return shape as the
// agent series. Uses the same external [rangeStartMs, rangeEndMs] time axis
// as buildPerAgentPctSeries so all series share one x-axis.
//
// Base is anchored to the first VTI close at/after rangeStartMs (the agents'
// actual start date) so the % return is relative to when the agents began.
// VTI may start partway across the chart if markets were closed on the first
// agent run date (e.g. the agents started on a Sunday).
export function buildBenchmarkPctSeries(
  points: { date: string; close: number }[],
  rangeStartMs: number,
  rangeEndMs: number
): PctSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // Anchor base to the trading day at/after the agents' first run.
  const rangeStartDate = new Date(rangeStartMs).toISOString().slice(0, 10);
  const basePoint = sorted.find((p) => p.date.slice(0, 10) >= rangeStartDate) ?? sorted[0];
  const base = basePoint.close;

  const tSpan = rangeEndMs - rangeStartMs || 1;

  return sorted.map((p) => {
    const t = new Date(p.date).getTime();
    return {
      runAt: p.date,
      pct: ((p.close - base) / base) * 100,
      // Clamp to [0, 1] — VTI points before rangeStart (weekend buffer)
      // are dropped to 0; points at/after rangeEnd clamp to 1.
      xFrac: Math.max(0, Math.min(1, (t - rangeStartMs) / tSpan)),
    };
  });
}


export function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtShortDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
