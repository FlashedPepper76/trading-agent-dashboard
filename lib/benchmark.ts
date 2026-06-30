// Fetches historical daily closes for a benchmark ticker (default: VTI, a
// total U.S. stock market index fund — a closer stand-in for "stocks in
// general" than a large-cap-only index) so the compare page can show
// whether the agents are beating or lagging a simple buy-and-hold.
// Yahoo's chart endpoint is unauthenticated and free; no API key needed.

export type BenchmarkPoint = { date: string; close: number };

export async function fetchBenchmarkSeries(
  symbol: string,
  period1Sec: number,
  period2Sec: number
): Promise<BenchmarkPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1Sec}&period2=${period2Sec}&interval=1d`;

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
