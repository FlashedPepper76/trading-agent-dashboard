import { getRuns, type Run, type Decision } from "../lib/supabase";

function fmtTime(iso: string) {
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }) + " ET"
  );
}

function isSameEtDay(isoA: string, isoB: string) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/New_York" };
  return new Date(isoA).toLocaleDateString("en-US", opts) === new Date(isoB).toLocaleDateString("en-US", opts);
}

function runHasTrade(run: Run) {
  return (run.trading_agent_decisions || []).some((d) => d.order_id);
}

function tradeCount(run: Run) {
  return (run.trading_agent_decisions || []).filter((d) => d.order_id).length;
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

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function SummaryBar({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return null;
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  const equity = latest.account_equity ?? null;
  const baseline = oldest.account_equity ?? null;
  const pnl = equity !== null && baseline !== null ? equity - baseline : null;
  const pnlPct = pnl !== null && baseline ? (pnl / baseline) * 100 : null;
  const today = runs.filter((r) => isSameEtDay(r.run_at, latest.run_at));
  const tradesToday = today.reduce((sum, r) => sum + tradeCount(r), 0);
  const pnlColor =
    pnl === null || pnl === 0 ? "var(--text-primary)" : pnl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
        gap: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 24,
      }}
    >
      <StatBlock label="Equity" value={fmtMoney(equity)} />
      <StatBlock
        label="P/L since first log"
        value={
          pnl === null
            ? "—"
            : `${pnl >= 0 ? "+" : ""}${fmtMoney(pnl)}${pnlPct !== null ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)` : ""}`
        }
        color={pnlColor}
      />
      <StatBlock label="Cash" value={fmtMoney(latest.account_cash)} />
      <StatBlock label="Open positions" value={String(latest.num_open_positions ?? 0)} />
      <StatBlock label="Runs today" value={String(today.length)} />
      <StatBlock label="Trades today" value={String(tradesToday)} />
      <StatBlock label="Last run" value={fmtTime(latest.run_at)} />
    </div>
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

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ onlyTrades?: string; show?: string }>;
}) {
  const params = await searchParams;
  const onlyTrades = params.onlyTrades === "1";
  const showCount = Math.max(10, parseInt(params.show || "30", 10) || 30);

  let allRuns: Run[] = [];
  let loadError: string | null = null;

  try {
    allRuns = await getRuns(500);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const filtered = onlyTrades ? allRuns.filter(runHasTrade) : allRuns;
  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  const toggleHref = `/?onlyTrades=${onlyTrades ? "0" : "1"}`;
  const showMoreHref = `/?onlyTrades=${onlyTrades ? "1" : "0"}&show=${showCount + 30}`;

  return (
    <div>
      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load the log: {loadError}</div>
      ) : allRuns.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "40px 0" }}>
          No runs logged yet. Once the agent runs during market hours, entries will show up here —
          newest first.
        </div>
      ) : (
        <>
          <SummaryBar runs={allRuns} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              showing {visible.length} of {filtered.length}
              {onlyTrades ? " runs with trades" : " runs"}
            </span>
            <a
              href={toggleHref}
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: onlyTrades ? "var(--accent-buy)" : "var(--text-muted)",
                textDecoration: "none",
                border: "1px solid var(--border-hairline)",
                borderRadius: 6,
                padding: "4px 10px",
              }}
            >
              {onlyTrades ? "✓ only trades" : "show only trades"}
            </a>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
              No runs with executed trades yet.
            </div>
          ) : (
            visible.map((run) => <RunEntry key={run.id} run={run} />)
          )}

          {hasMore ? (
            <a
              href={showMoreHref}
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
                textDecoration: "none",
                border: "1px solid var(--border-hairline)",
                borderRadius: 8,
                padding: "10px 0",
                marginTop: 8,
              }}
            >
              Show more (+30)
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
