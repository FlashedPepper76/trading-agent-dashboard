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
// a day, so their raw run timestamps never line up.
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

export function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtShortDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Server-renderable SVG line chart, same zero-dependency approach as the
// Sparkline on the overview page, extended to multiple aligned series
// sharing one y-domain so the lines are visually comparable.
export function DualReturnChart({
  series,
  agentIds,
  colors,
}: {
  series: AlignedPoint[];
  agentIds: string[];
  colors: Record<string, string>;
}) {
  if (series.length < 2) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>
        Not enough history yet for a comparison chart.
      </div>
    );
  }

  const w = 600;
  const h = 200;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 24;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const allValues = series.flatMap((p) => agentIds.map((id) => p.pctByAgent[id])).filter(
    (v): v is number => v != null
  );
  const min = Math.min(0, ...allValues);
  const max = Math.max(0, ...allValues);
  const range = max - min || 1;

  const x = (i: number) => padLeft + (i / (series.length - 1)) * plotW;
  const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;
  const zeroY = y(0);

  const linesByAgent = agentIds.map((id) => {
    const points = series
      .map((p, i) => {
        const v = p.pctByAgent[id];
        return v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter((p): p is string => p !== null)
      .join(" ");
    return { id, points };
  });

  const tickIdx = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <line
        x1={padLeft}
        x2={w - padRight}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--border-hairline)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />
      {linesByAgent.map(({ id, points }) => (
        <polyline
          key={id}
          points={points}
          fill="none"
          stroke={colors[id]}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {tickIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={h - 6}
          fontSize={10}
          fontFamily="var(--font-mono)"
          fill="var(--text-faint)"
          textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
        >
          {fmtShortDate(series[i].date)}
        </text>
      ))}
    </svg>
  );
}
