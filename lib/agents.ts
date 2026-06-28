export type AgentId = "plutus" | "helios";

export type AgentMeta = {
  id: AgentId;
  label: string;
  tagline: string;
  description: string;
  accent: string; // CSS var reference for this agent's accent color
  accentDim: string;
};

export const AGENTS: Record<AgentId, AgentMeta> = {
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

export const AGENT_IDS: AgentId[] = ["plutus", "helios"];

export function isAgentId(value: string): value is AgentId {
  return value === "plutus" || value === "helios";
}
