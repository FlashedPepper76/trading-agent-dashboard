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

// xFrac is each point's horizontal position on the chart, 0..1. For
// per-agent series it's just the point's index fraction (see below). For
// the benchmark series it's a calendar-time fraction instead, so the chart
// renderer can place every series on a shared x axis without needing to
// know which kind of series it's looking at.
export type PctSeriesPoint = { runAt: string; pct: number; xFrac: number };

// Same algorithm as the Scriptable widget's toPctSeries/drawComparisonChart:
// each agent's own equity history (oldest -> newest), % change from that
// agent's own first equity reading. No calendar-date alignment between
// agents — each line is plotted across the full chart width on its own
// run index, exactly like the widget does, since Plutus and Helios run on
// very different schedules and the widget never tried to reconcile that.
export function buildPerAgentPctSeries(runsByAgent: Record<string, Run[]>): Record<string, PctSeriesPoint[]> {
  const result: Record<string, PctSeriesPoint[]> = {};
  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse().filter((r) => r.account_equity != null);
    const base = chronological[0]?.account_equity ?? null;
    const n = chronological.length;
    result[agentId] = base
      ? chronological.map((r, i) => ({
          runAt: r.run_at,
          pct: ((r.account_equity! - base) / base) * 100,
          xFrac: n > 1 ? i / (n - 1) : 0.5,
        }))
      : [];
  }
  return result;
}

// Turns raw benchmark closes (e.g. SPY) into the same % return shape as the
// agent series, but positioned by actual calendar time (rangeStartMs ->
// rangeEndMs) rather than by index, since the benchmark has one point per
// trading day while agents have wildly different run cadences.
export function buildBenchmarkPctSeries(
  points: { date: string; close: number }[],
  rangeStartMs: number,
  rangeEndMs: number
): PctSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const base = sorted[0].close;
  const span = rangeEndMs - rangeStartMs || 1;
  return sorted.map((p) => {
    const t = new Date(p.date).getTime();
    const xFrac = Math.max(0, Math.min(1, (t - rangeStartMs) / span));
    return {
      runAt: p.date,
      pct: ((p.close - base) / base) * 100,
      xFrac,
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
