// Thin wrapper around Yahoo's free, unauthenticated chart endpoint. Used
// for two things:
//   - fetchRangeSeries: an arbitrary historical window at the finest
//     interval Yahoo allows for that span (used for the compare page's
//     total-market benchmark line).
//   - fetchTodaySeries: today's intraday bars for a single symbol (used
//     for the per-holding day-trend sparklines on the Positions page).
// Both return the same plain { date, close } shape.

export type QuotePoint = { date: string; close: number };

type YahooChartResult = {
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
};

async function fetchYahooChart(
  symbol: string,
  query: string,
  revalidateSeconds: number
): Promise<QuotePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArgusDashboard/1.0)" },
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) throw new Error(`Failed to load quote data for ${symbol}: ${res.status}`);

  const data = await res.json();
  const result: YahooChartResult | undefined = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const points: QuotePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close });
  }
  return points;
}

// Granularity is picked automatically based on the requested range, since
// Yahoo only serves fine-grained intraday bars for recent history (5-minute
// bars cover up to ~6 days, 30-minute up to ~55 days, hourly up to ~2
// years). Using the finest interval the range allows means the line shows
// real intraday movement instead of a flat day-to-day step.
function pickInterval(period1Sec: number, period2Sec: number): string {
  const days = (period2Sec - period1Sec) / 86400;
  if (days <= 6) return "5m";
  if (days <= 55) return "30m";
  if (days <= 700) return "60m";
  return "1d";
}

export async function fetchRangeSeries(
  symbol: string,
  period1Sec: number,
  period2Sec: number
): Promise<QuotePoint[]> {
  const interval = pickInterval(period1Sec, period2Sec);
  return fetchYahooChart(symbol, `period1=${period1Sec}&period2=${period2Sec}&interval=${interval}`, 3600);
}

// Today's session at 5-minute bars (Yahoo's "range=1d" resolves the
// trading-day boundary itself — pre-market it returns the prior session).
// Short revalidate window since this is meant to track the day as it
// happens, not just show its eventual shape.
export async function fetchTodaySeries(symbol: string): Promise<QuotePoint[]> {
  return fetchYahooChart(symbol, "range=1d&interval=5m", 300);
}
