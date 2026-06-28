import { notFound } from "next/navigation";
import { getPositions, type Position } from "../../../../lib/supabase";
import { AGENTS, isAgentId } from "../../../../lib/agents";
import { fmtMoney } from "../../../run-helpers";
import AgentSubNav from "../../../agent-sub-nav";

function PositionCard({ position, accent }: { position: Position; accent: string }) {
  const pl = position.unrealized_pl_pct;
  const plColor = pl === null || pl === undefined || pl === 0 ? "var(--text-muted)" : pl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";

  return (
    <div
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "14px 16px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{position.symbol}</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{position.qty} sh</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 16px",
          marginTop: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>BOUGHT @</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.avg_entry_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>CURRENT</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.current_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>P/L</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: plColor }}>
            {pl == null ? "—" : `${pl >= 0 ? "+" : ""}${pl.toFixed(2)}%`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>MARKET VALUE</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.market_value)}</div>
        </div>
      </div>

      <div style={{ height: 3, borderRadius: 2, background: accent, opacity: 0.5, marginTop: 12 }} />
    </div>
  );
}

export default async function PositionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAgentId(id)) notFound();
  const agent = AGENTS[id];

  let positions: Position[] = [];
  let loadError: string | null = null;
  try {
    positions = await getPositions(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const totalMarketValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const snapshotAt = positions[0]?.snapshot_at;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={id} active="positions" />

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load positions: {loadError}</div>
      ) : positions.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "30px 0" }}>
          No open positions right now. Either nothing&apos;s been bought yet, or every order placed so far is
          still pending and hasn&apos;t filled — check the log for pending orders.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--text-faint)",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <span>
              {positions.length} position{positions.length === 1 ? "" : "s"} · {fmtMoney(totalMarketValue)} total
              market value
            </span>
            {snapshotAt ? (
              <span>
                as of{" "}
                {new Date(snapshotAt).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET
              </span>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {positions.map((p) => (
              <PositionCard key={p.id} position={p} accent={agent.accent} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
