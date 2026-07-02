import type { Run } from "./supabase";

// Deeper performance stats than the compare page's basic set. Win rate alone
// is misleading (a 28% win rate can be profitable if wins are big and losses
// are small) — these numbers say whether the edge is real.

export type AdvancedStats = {
  closedTrades: number;
  winRate: number | null;       // % of closed sells with positive realized P/L
  avgWinPct: number | null;     // mean realized % on winning closes
  avgLossPct: number | null;    // mean realized % on losing closes (negative)
  profitFactor: number | null;  // gross win % / gross loss % (>1 = profitable edge)
  expectancyPct: number | null; // mean realized % per closed trade
  sharpe: number | null;        // annualized, from daily equity closes
  maxDrawdownPct: number;       // most negative peak-to-trough %
};

export function computeAdvancedStats(runs: Run[]): AdvancedStats {
  const decisions = runs.flatMap((r) => r.trading_agent_decisions || []);
  const closed = decisions
    .filter((d) => d.action === "sell" && d.order_id && d.realized_pnl_pct != null)
    .map((d) => Number(d.realized_pnl_pct));

  const wins = closed.filter((v) => v > 0);
  const losses = closed.filter((v) => v < 0);
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const mean = (a: number[]) => (a.length ? sum(a) / a.length : null);

  const grossWin = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  const profitFactor =
    closed.length === 0 ? null : grossLoss === 0 ? (grossWin > 0 ? Infinity : null) : grossWin / grossLoss;

  // Daily equity closes: last equity reading per calendar date, chronological.
  const chronological = [...runs].reverse();
  const lastByDate = new Map<string, number>();
  for (const r of chronological) {
    if (r.account_equity != null) lastByDate.set(r.run_at.slice(0, 10), r.account_equity);
  }
  const dailyEquity = Array.from(lastByDate.values());

  // Daily returns → annualized Sharpe (rf ≈ 0 for a short paper-trading window).
  let sharpe: number | null = null;
  if (dailyEquity.length >= 3) {
    const rets: number[] = [];
    for (let i = 1; i < dailyEquity.length; i++) {
      if (dailyEquity[i - 1] > 0) rets.push(dailyEquity[i] / dailyEquity[i - 1] - 1);
    }
    const m = mean(rets);
    if (m !== null && rets.length >= 2) {
      const variance = sum(rets.map((r) => (r - m) ** 2)) / (rets.length - 1);
      const sd = Math.sqrt(variance);
      sharpe = sd === 0 ? null : (m / sd) * Math.sqrt(252);
    }
  }

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const e of dailyEquity) {
    peak = Math.max(peak, e);
    if (peak > 0) maxDrawdownPct = Math.min(maxDrawdownPct, ((e - peak) / peak) * 100);
  }

  return {
    closedTrades: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    avgWinPct: mean(wins),
    avgLossPct: mean(losses),
    profitFactor,
    expectancyPct: mean(closed),
    sharpe,
    maxDrawdownPct,
  };
}

export function fmtStatPct(v: number | null, signed = true) {
  if (v == null) return "—";
  return `${signed && v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtRatio(v: number | null) {
  if (v == null) return "—";
  if (v === Infinity) return "∞";
  return v.toFixed(2);
}
