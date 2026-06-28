const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY!;

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
  confidence: string | null;
  reasoning: string | null;
  order_id: string | null;
  order_status: string | null;
  created_at: string;
};

export type Run = {
  id: number;
  run_at: string;
  market_open: boolean | null;
  account_equity: number | null;
  account_cash: number | null;
  num_open_positions: number | null;
  overall_reasoning: string | null;
  model_used: string | null;
  error: string | null;
  trading_agent_decisions: Decision[];
};

export async function getRuns(limit = 50): Promise<Run[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trading_agent_runs?select=*,trading_agent_decisions(*)&order=run_at.desc&limit=${limit}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load runs: ${res.status}`);
  return res.json();
}

export async function getInstructions(): Promise<{ content: string; updated_at: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_instructions?id=eq.1&select=content,updated_at`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load instructions: ${res.status}`);
  const rows = await res.json();
  return rows[0];
}

export async function saveInstructions(content: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_instructions?id=eq.1`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Failed to save instructions: ${res.status}`);
}
