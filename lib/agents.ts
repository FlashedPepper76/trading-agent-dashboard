// Plutus and Helios are hardcoded here, same as always — untouched by any
// of the dynamic-agent additions below, zero behavior change for either.
//
// Agents created through the dashboard's "Add agent" flow aren't hardcoded
// anywhere in this repo; they live in Supabase's `agents` table instead
// (see register_agent() in the life-dashboard project). getAllAgents() /
// getAgentMeta() merge the two sources so the rest of the app can treat
// every agent the same way regardless of where it came from.

export type AgentId = string;

export type AgentMeta = {
  id: AgentId;
  label: string;
  tagline: string;
  description: string;
  accent: string; // CSS var reference (static agents) or a literal hex (dynamic agents)
  accentDim: string;
  dynamic?: boolean; // true for agents loaded from Supabase rather than hardcoded below
};

const STATIC_AGENTS: Record<string, AgentMeta> = {
  plutus: {
    id: "plutus",
    label: "Plutus",
    tagline: "maximize returns",
    description: "Runs every minute during market hours. Willing to take real positions on conviction.",
    accent: "var(--accent-buy)",
    accentDim: "var(--accent-buy-dim)",
  },
  helios: {
    id: "helios",
    label: "Helios",
    tagline: "preserve capital, long horizon",
    description: "Runs once a day near the open. Smaller positions, bigger cash buffer, slower to act.",
    accent: "var(--accent-helios)",
    accentDim: "var(--accent-helios-dim)",
  },
};

// Kept exactly as before for any code that only ever meant "the two
// hardcoded agents" (e.g. the icon map in nav.tsx).
export const AGENTS = STATIC_AGENTS;
export const AGENT_IDS: string[] = ["plutus", "helios"];

export function isAgentId(value: string): boolean {
  return value in STATIC_AGENTS;
}

// --------------------------------------------------------------------------
// Dynamic agents (Supabase-backed)
// --------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";

// Cycled for dynamic agents that don't set their own accent_color — keeps
// new agents visually distinct from Plutus/Helios and from each other
// without needing the creator to pick a color.
const FALLBACK_ACCENTS = ["#fb923c", "#2dd4bf", "#f472b6", "#facc15", "#c084fc", "#94a3b8"];

type AgentRow = {
  id: string;
  label: string;
  tagline: string | null;
  risk_level: string | null;
  accent_color: string | null;
  active: boolean;
};

function toAgentMeta(row: AgentRow, fallbackIndex: number): AgentMeta {
  const accent = row.accent_color || FALLBACK_ACCENTS[fallbackIndex % FALLBACK_ACCENTS.length];
  return {
    id: row.id,
    label: row.label,
    tagline: row.tagline || row.risk_level || "",
    description: row.risk_level ? `${row.risk_level} risk profile.` : "",
    accent,
    accentDim: `${accent}1a`,
    dynamic: true,
  };
}

export async function getDynamicAgents(): Promise<AgentMeta[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?select=*&active=eq.true&order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows: AgentRow[] = await res.json();
    return rows.map((row, i) => toAgentMeta(row, i));
  } catch {
    // A dynamic-agent fetch failure shouldn't take down pages that only
    // care about Plutus/Helios — just act as if there are no dynamic
    // agents this request.
    return [];
  }
}

export async function getAllAgents(): Promise<AgentMeta[]> {
  const dynamic = await getDynamicAgents();
  return [...AGENT_IDS.map((id) => STATIC_AGENTS[id]), ...dynamic];
}

export async function getAgentMeta(id: string): Promise<AgentMeta | null> {
  if (isAgentId(id)) return STATIC_AGENTS[id];
  const dynamic = await getDynamicAgents();
  return dynamic.find((a) => a.id === id) ?? null;
}
