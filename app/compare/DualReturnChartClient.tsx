"use client";

import { useState } from "react";
import type { PctSeriesPoint } from "./compare-helpers";
import { fmtPct, fmtShortDate } from "./compare-helpers";
import { AGENTS } from "../../lib/agents";

export function DualReturnChart({
  seriesByAgent,
  agentIds,
  colors,
}: {
  seriesByAgent: Record<string, PctSeriesPoint[]>;
  agentIds: string[];
  colors: Record<string, string>;
}) {
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  const hasEnoughData = agentIds.some((id) => (seriesByAgent[id]?.length ?? 0) >= 2);
  if (!hasEnoughData) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>
        Not enough history yet for a comparison chart.
      </div>
    );
  }

  const w = 640;
  const h = 280;
  const padLeft = 44;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 26;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const allValues = agentIds.flatMap((id) => (seriesByAgent[id] || []).map((p) => p.pct));
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(0, ...allValues);
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;

  // Each agent's line spans the full plot width on its own index, exactly
  // like the widget — Plutus's 60+ runs/day and Helios's 1 run/day are not
  // reconciled onto a shared date axis, they're just two independently
  // spaced polylines overlaid in the same box.
  const linesByAgent = agentIds.map((id) => {
    const pts = seriesByAgent[id] || [];
    const n = pts.length;
    const points = pts.map((p, i) => ({
      x: padLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2),
      y: y(p.pct),
      pct: p.pct,
      runAt: p.runAt,
    }));
    return { id, points, polyline: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
  });

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => min + (range * i) / (yTickCount - 1));

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const frac = (relX - padLeft) / plotW;
    setHoverFrac(Math.max(0, Math.min(1, frac)));
  }

  // For a given hover fraction, find the nearest point on each agent's own
  // (independently spaced) line.
  function nearestPoint(id: string) {
    const pts = seriesByAgent[id] || [];
    if (pts.length === 0 || hoverFrac == null) return null;
    const idx = Math.round(hoverFrac * (pts.length - 1));
    const clamped = Math.max(0, Math.min(pts.length - 1, idx));
    return pts[clamped];
  }

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={w - padRight}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-hairline)"
              strokeWidth={1}
              strokeDasharray={Math.abs(v) < 1e-9 ? undefined : "2,4"}
              opacity={Math.abs(v) < 1e-9 ? 1 : 0.5}
            />
            <text
              x={padLeft - 8}
              y={y(v)}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--text-faint)"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v >= 0 ? "+" : ""}
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        {linesByAgent.map(({ id, polyline }) => (
          <polyline
            key={id}
            points={polyline}
            fill="none"
            stroke={colors[id]}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hoverFrac != null && (
          <line
            x1={padLeft + hoverFrac * plotW}
            x2={padLeft + hoverFrac * plotW}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}

        {hoverFrac != null &&
          agentIds.map((id) => {
            const p = nearestPoint(id);
            if (!p) return null;
            const pts = seriesByAgent[id] || [];
            const idx = pts.indexOf(p);
            const cx = padLeft + (pts.length > 1 ? (idx / (pts.length - 1)) * plotW : plotW / 2);
            return (
              <circle key={id} cx={cx} cy={y(p.pct)} r={3.5} fill={colors[id]} stroke="var(--bg-surface)" strokeWidth={1.5} />
            );
          })}

        <text x={padLeft} y={h - 6} fontSize={10} fontFamily="var(--font-mono)" fill="var(--text-faint)" textAnchor="start">
          oldest
        </text>
        <text x={w - padRight} y={h - 6} fontSize={10} fontFamily="var(--font-mono)" fill="var(--text-faint)" textAnchor="end">
          latest
        </text>

        <rect
          x={padLeft}
          y={padTop}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverFrac(null)}
        />
      </svg>

      {hoverFrac != null ? (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            minWidth: 150,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {agentIds.map((id) => {
            const p = nearestPoint(id);
            return (
              <div key={id} style={{ padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[id], display: "inline-block" }} />
                    {AGENTS[id as keyof typeof AGENTS]?.label ?? id}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: !p ? "var(--text-faint)" : p.pct >= 0 ? "var(--accent-buy)" : "var(--accent-sell)",
                    }}
                  >
                    {p ? fmtPct(p.pct) : "—"}
                  </span>
                </div>
                {p ? (
                  <div style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                    {fmtShortDate(p.runAt.slice(0, 10))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
