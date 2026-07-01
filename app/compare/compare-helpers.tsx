import type { Run } from "../../lib/supabase";

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

export function buildAlignedReturnSeries(runsByAgent: Record<string, Run[]>): AlignedPoint[] {
  const dailyByAgent: Record<string, { byDate: Map<string, number>; start: number | null }> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse();
    const byDate = new Map<string, number>();
    for (const r of chronological) {
      if (r.account_equity == null) continue;
      byDate.set(r.run_at.slice(0, 10), r.account_equity);
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

export type PctSeriesPoint = { runAt: string; pct: number; xFrac: number };

// Day-slot xFrac: each calendar date in the shared axis gets equal width
// (1/numSlots). Runs within a day are evenly spaced by count within that
// slot. This eliminates the long diagonal "straight lines" that appear in
// raw calendar-time xFrac when agents don't run overnight — a 16-hour gap
// would otherwise span ~30% of the chart as one straight line.
//
// Agents that started later (e.g. Hermes on Jul 1) correctly appear only
// in their day's slot rather than spanning the full chart width.
export function buildPerAgentPctSeries(
  runsByAgent: Record<string, Run[]>,
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): Record<string, PctSeriesPoint[]> {
  const result: Record<string, PctSeriesPoint[]> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse().filter((r) => r.account_equity != null);
    const base = chronological[0]?.account_equity ?? null;
    if (!base) { result[agentId] = []; continue; }

    // Group runs by calendar date; Map preserves insertion order (chronological).
    const byDate = new Map<string, typeof chronological>();
    for (const r of chronological) {
      const d = r.run_at.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }

    const points: PctSeriesPoint[] = [];
    for (const [dateStr, dateRuns] of byDate) {
      const slotIdx = daySlotIndex[dateStr] ?? 0;
      const n = dateRuns.length;
      dateRuns.forEach((r, i) => {
        const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
        points.push({
          runAt: r.run_at,
          pct: ((r.account_equity! - base) / base) * 100,
          xFrac: (slotIdx + inSlotFrac) / daySlotCount,
        });
      });
    }

    result[agentId] = points;
  }
  return result;
}

// VTI benchmark: placed using the same day-slot logic as agent runs so the
// line has the same visual density. When intraday 1-minute bars are available
// (written by Plutus's snapshot) the result is ~390 points per trading day,
// matching Plutus's own run density and giving VTI real shape on the chart.
// Falls back gracefully to daily-close-only mode (3 points) if intraday
// data hasn't been collected yet.
export function buildBenchmarkPctSeries(
  points: { date: string; close: number }[],
  rangeStartMs: number,
  rangeEndMs: number,
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): PctSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // Anchor % return to the first VTI price at/after the agents' start date.
  const rangeStartDate = new Date(rangeStartMs).toISOString().slice(0, 10);
  const basePoint = sorted.find((p) => p.date.slice(0, 10) >= rangeStartDate) ?? sorted[0];
  const base = basePoint.close;

  // Group by calendar date so intraday points get evenly spaced within
  // their day-slot, exactly like buildPerAgentPctSeries does for agent runs.
  const byDate = new Map<string, typeof sorted>();
  for (const p of sorted) {
    const d = p.date.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(p);
  }

  const result: PctSeriesPoint[] = [];
  for (const [dateStr, dayPoints] of byDate) {
    const slotIdx = daySlotIndex[dateStr];
    if (slotIdx === undefined) continue; // date outside agent date range
    const n = dayPoints.length;
    dayPoints.forEach((p, i) => {
      const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
      result.push({
        runAt: p.date,
        pct: ((p.close - base) / base) * 100,
        xFrac: (slotIdx + inSlotFrac) / daySlotCount,
      });
    });
  }

  return result;
}

// ── Daily-reset series builders ──────────────────────────────────────────────
// These produce the same xFrac layout as the all-time versions but the %
// return base resets to each day's first data point instead of the agent's
// all-time first reading. Used by the "Since day open" tab on the compare chart.

export function buildPerAgentPctSeriesDaily(
  runsByAgent: Record<string, Run[]>,
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): Record<string, PctSeriesPoint[]> {
  const result: Record<string, PctSeriesPoint[]> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse().filter((r) => r.account_equity != null);

    const byDate = new Map<string, typeof chronological>();
    for (const r of chronological) {
      const d = r.run_at.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }

    const points: PctSeriesPoint[] = [];
    for (const [dateStr, dateRuns] of byDate) {
      const slotIdx = daySlotIndex[dateStr];
      if (slotIdx === undefined) continue;
      const dayBase = dateRuns[0].account_equity!;
      const n = dateRuns.length;
      dateRuns.forEach((r, i) => {
        const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
        points.push({
          runAt: r.run_at,
          pct: ((r.account_equity! - dayBase) / dayBase) * 100,
          xFrac: (slotIdx + inSlotFrac) / daySlotCount,
        });
      });
    }

    result[agentId] = points;
  }
  return result;
}

export function buildBenchmarkPctSeriesDaily(
  points: { date: string; close: number }[],
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): PctSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<string, typeof sorted>();
  for (const p of sorted) {
    const d = p.date.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(p);
  }

  const result: PctSeriesPoint[] = [];
  for (const [dateStr, dayPoints] of byDate) {
    const slotIdx = daySlotIndex[dateStr];
    if (slotIdx === undefined) continue;
    const dayBase = dayPoints[0].close;
    const n = dayPoints.length;
    dayPoints.forEach((p, i) => {
      const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
      result.push({
        runAt: p.date,
        pct: ((p.close - dayBase) / dayBase) * 100,
        xFrac: (slotIdx + inSlotFrac) / daySlotCount,
      });
    });
  }

  return result;
}

export function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtShortDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
