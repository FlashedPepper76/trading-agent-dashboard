import { getRuns, type Run, type Decision } from "../lib/supabase";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function railColor(decisions: Decision[]) {
  const acted = decisions.filter((d) => d.order_id);
  const buys = acted.filter((d) => d.action === "buy").length;
  const sells = acted.filter((d) => d.action === "sell").length;
  if (buys === 0 && sells === 0) return "var(--border-hairline)";
  if (buys > sells) return "var(--accent-buy)";
  if (sells > buys) return "var(--accent-sell)";
  return "var(--accent-hold)";
}

function actionBadge(action: string, executed: boolean) {
  const colorVar =
    action === "buy" ? "buy" : action === "sell" ? "sell" : "hold";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 4,
        color: `var(--accent-${colorVar})`,
        background: `var(--accent-${colorVar}-dim)`,
        opacity: executed ? 1 : 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {action.toUpperCase()}
      {!executed && " · skipped"}
    </span>
  );
}

function confidenceDots(confidence: string | null) {
  const level = confidence === "high" ? 3 : confidence === "medium" ? 2 : confidence === "low" ? 1 : 0;
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 8 }} title={confidence || "n/a"}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: i < level ? "var(--text-muted)" : "var(--border-hairline)",
          }}
        />
      ))}
    </span>
  );
}

function RunEntry({ run }: { run: Run }) {
  const decisions = run.trading_agent_decisions || [];
  const acted = decisions.filter((d) => d.order_id);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        marginBottom: 28,
      }}
    >
      <div
        style={{
          width: 3,
          borderRadius: 2,
          background: railColor(decisions),
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{fmtTime(run.run_at)}</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            equity {fmtMoney(run.account_equity)} · cash {fmtMoney(run.account_cash)} ·{" "}
            {run.num_open_positions ?? 0} open · {run.model_used || "—"}
          </span>
        </div>

        {run.error ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--accent-sell)",
              background: "var(--accent-sell-dim)",
              border: "1px solid var(--accent-sell)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 10,
            }}
          >
            run failed: {run.error}
          </div>
        ) : null}

        {run.overall_reasoning ? (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--text-primary)",
              borderLeft: "2px solid var(--border-hairline)",
              paddingLeft: 12,
              margin: "0 0 12px",
            }}
          >
            {run.overall_reasoning}
          </p>
        ) : null}

        {run.news_context ? (
          <details style={{ marginBottom: 12 }}>
            <summary
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                color: "var(--text-faint)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              NEWS / POLITICS / SOCIETY CONTEXT CONSIDERED
            </summary>
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--text-muted)",
                margin: "8px 0 0",
                whiteSpace: "pre-line",
                borderLeft: "2px solid var(--border-hairline)",
                paddingLeft: 12,
              }}
            >
              {run.news_context}
            </p>
          </details>
        ) : null}

        {decisions.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-faint)" }}>no symbols acted on this run</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {decisions.map((d) => (
              <div
                key={d.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {actionBadge(d.action, Boolean(d.order_id))}
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.symbol}</span>
                  {d.qty ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{d.qty} sh</span>
                  ) : null}
                  {confidenceDots(d.confidence)}
                  <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto" }}>
                    {d.order_status}
                  </span>
                </div>
                {d.reasoning ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    {d.reasoning}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function LogPage() {
  let runs: Run[] = [];
  let loadError: string | null = null;

  try {
    runs = await getRuns(50);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div>
      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load the log: {loadError}</div>
      ) : runs.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "40px 0" }}>
          No runs logged yet. Once the agent runs during market hours, entries will show up here —
          newest first.
        </div>
      ) : (
        runs.map((run) => <RunEntry key={run.id} run={run} />)
      )}
    </div>
  );
}
