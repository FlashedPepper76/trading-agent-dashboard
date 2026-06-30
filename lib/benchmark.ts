// Fetches historical closes for a benchmark ticker (default: VTI, a total
// U.S. stock market index fund — a closer stand-in for "stocks in general"
// than a large-cap-only index) so the compare page can show whether the
// agents are beating or lagging a simple buy-and-hold over the same window.
// Yahoo's chart endpoint is unauthenticated and free; no API key needed.
//
// Granularity is picked automatically based on the requested range, since
// Yahoo only serves fine-grained intraday bars for recent history (5-minute
// bars cover up to ~6 days, 30-minute up to ~55 days, hourly up to ~2
// years). Using the finest interval the range allows means the benchmark
// line shows real intraday movement instead of a flat day-to-day step —
// closer to how densely the agents' own run history is plotted.

export type BenchmarkPoint = { date: string; close: number };

function pickInterval(period1Sec: number, period2Sec: number): string {
  const days = (period2Sec - period1Sec) / 86400;
  if (days <= 6) return "5m";
  if (days <= 55) return "30m";
  if (days <= 700) return "60m";
  return "1d";
}

export async function fetchBenchmarkSeries(
  symbol: string,
  period1Sec: number,
  period2Sec: number
): Promise<BenchmarkPoint[]> {
  const interval = pickInterval(period1Sec, period2Sec);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1Sec}&period2=${period2Sec}&interval=${interval}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArgusDashboard/1.0)" },
    // Daily data — no need to refetch on every page load.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Failed to load benchmark data: ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp || [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

  const points: BenchmarkPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close });
  }
  return points;
}
