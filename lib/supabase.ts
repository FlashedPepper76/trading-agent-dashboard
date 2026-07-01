// Fallback to the life-dashboard Supabase project so the log still works even if
// the Vercel project's env vars haven't been set yet. These are the public
// anon/publishable values (see README — not secrets, RLS controls access).
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

export type Decision = {
  id: number;
  run_id: number;
  symbol: string;
  action: string;
  qty: number | null;
  entry_price: number | null;
  exit_price: number | null;
  realized_pnl_pct: number | null;
  confidence: string | null;
  reasoning: string | null;
  order_id: string | null;
  order_status: string | null;
  created_at: string;
};

export type Position = {
  id: number;
  agent_id: string;
  symbol: string;
  qty: number;
  avg_entry_price: number | null;
  current_price: number | null;
  unrealized_pl_pct: number | null;
  market_value: number | null;
  snapshot_at: string;
};

export type AccountState = {
  agent_id: string;
  equity: number | null;
  cash: number | null;
  num_open_positions: number | null;
  updated_at: string;
};

export async function getAccountState(agentId: string): Promise<AccountState | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_account_state?agent_id=eq.${agentId}&select=*`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load account state: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

export async function getPositions(agentId: string): Promise<Position[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    select: "*",
    order: "market_value.desc",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_positions?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load positions: ${res.status}`);
  return res.json();
}

export type Run = {
  id: number;
  agent_id: string;
  trigger: string | null;
  run_at: string;
  market_open: boolean | null;
  account_equity: number | null;
  account_cash: number | null;
  num_open_positions: number | null;
  overall_reasoning: string | null;
  model_used: string | null;
  error: string | null;
  news_context: string | null;
  trading_agent_decisions: Decision[];
};

export async function getRuns(limit = 500, before?: string, agentId?: string): Promise<Run[]> {
  const params = new URLSearchParams({
    select: "*,trading_agent_decisions(*)",
    order: "run_at.desc",
    limit: String(limit),
  });
  if (before) params.set("run_at", `lt.${before}`);
  if (agentId) params.set("agent_id", `eq.${agentId}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_runs?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load runs: ${res.status}`);
  return res.json();
}

export async function getLatestRun(agentId: string): Promise<Run | null> {
  const runs = await getRuns(1, undefined, agentId);
  return runs[0] ?? null;
}

export async function getInstructions(agentId: string): Promise<{ content: string; updated_at: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_instructions?agent_id=eq.${agentId}&select=content,updated_at`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load instructions: ${res.status}`);
  const rows = await res.json();
  return rows[0];
}

export async function saveInstructions(agentId: string, content: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_instructions?agent_id=eq.${agentId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Failed to save instructions: ${res.status}`);
}

export async function saveSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_push_subscriptions`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ endpoint, p256dh, auth }),
  });
  if (!res.ok) throw new Error(`Failed to save subscription: ${res.status}`);
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: "DELETE", headers: headers() }
  );
  if (!res.ok) throw new Error(`Failed to delete subscription: ${res.status}`);
}

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export async function getAllSubscriptions(): Promise<PushSubscriptionRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_push_subscriptions?select=endpoint,p256dh,auth`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load subscriptions: ${res.status}`);
  return res.json();
}

// Benchmark (VTI) price data — written by the Python snapshot every minute
// (Plutus only) via Alpaca's data API; read here by the compare page.
// This avoids external API calls from Vercel which are blocked for stooq/Yahoo.
export type BenchmarkPrice = { date: string; close: number };

export async function getBenchmarkPrices(
  symbol: string,
  fromDate: string  // YYYY-MM-DD inclusive
): Promise<BenchmarkPrice[]> {
  // Query on price_time (the new PK) so intraday rows are returned alongside
  // daily ones. price_time >= midnight on fromDate captures everything that day.
  const params = new URLSearchParams({
    symbol: `eq.${symbol}`,
    price_time: `gte.${fromDate}T00:00:00Z`,
    select: "price_time,close",
    order: "price_time.asc",
    limit: "5000", // plenty for any date range the compare page needs
  });
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/benchmark_prices?${params.toString()}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load benchmark prices: ${res.status}`);
  const rows: { price_time: string; close: number }[] = await res.json();
  return rows.map((r) => ({ date: r.price_time, close: r.close }));
}
