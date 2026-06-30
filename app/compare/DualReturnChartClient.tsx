"use client";

import { useState } from "react";
import type { PctSeriesPoint } from "./compare-helpers";
import { fmtPct, fmtShortDate } from "./compare-helpers";
import { AGENTS } from "../../lib/agents";

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: PctSeriesPoint[];
  dashed?: boolean;
};

export function DualReturnChart({
  seriesByAgent,
  agentIds,
  colors,
  benchmarkSeries,
  benchmarkLabel = "Total market (VTI)",
  benchmarkColor = "var(--accent-benchmark)",
}: {
  seriesByAgent: Record<string, PctSeriesPoint[]>;
  agentIds: string[];
  colors: Record<string, string>;
  benchmarkSeries?: PctSeriesPoint[];
  benchmarkLabel?: string;
  benchmarkColor?: string;
}) {
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  const allSeries: ChartSeries[] = agentIds.map((id) => ({
    id,
    label: AGENTS[id as keyof typeof AGENTS]?.label ?? id,
    color: colors[id],
    points: seriesByAgent[id] || [],
  }));
  if (benchmarkSeries && benchmarkSeries.length >= 2) {
    allSeries.push({
      id: "__benchmark",
      label: benchmarkLabel,
      color: benchmarkColor,
      points: benchmarkSeries,
      dashed: true,
    });
  }

  const hasEnoughData = allSeries.some((s) => s.points.length >= 2);
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

  const allValues = allSeries.flatMap((s) => s.points.map((p) => p.pct));
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(0, ...allValues);
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;
  const x = (xFrac: number) => padLeft + xFrac * plotW;

  // Every series carries its own xFrac (0..1) computed upstream — run-index
  // fraction for agents, calendar-time fraction for the benchmark — so the
  // renderer doesn't need to know which kind of series it's drawing.
  const linesBySeries = allSeries.map((s) => ({
    ...s,
    polyline: s.points.map((p) => `${x(p.xFrac).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" "),
  }));

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => min + (range * i) / (yTickCount - 1));

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const frac = (relX - padLeft) / plotW;
    setHoverFrac(Math.max(0, Math.min(1, frac)));
  }

  // For a given hover fraction, find the point in this series whose xFrac
  // is closest — works regardless of how that series is spaced internally.
  function nearestPoint(points: PctSeriesPoint[]) {
    if (points.length === 0 || hoverFrac == null) return null;
    let best = points[0];
    let bestDist = Math.abs(best.xFrac - hoverFrac);
    for (const p of points) {
      const d = Math.abs(p.xFrac - hoverFrac);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
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

        {linesBySeries.map(({ id, polyline, color, dashed }) => (
          <polyline
            key={id}
            points={polyline}
            fill="none"
            stroke={color}
            strokeWidth={dashed ? 1.75 : 2.5}
            strokeDasharray={dashed ? "5,4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            className="chart-line-draw"
          />
        ))}

        {hoverFrac != null && (
          <line
            x1={x(hoverFrac)}
            x2={x(hoverFrac)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3,3"
            className="chart-cursor-fade"
          />
        )}

        {hoverFrac != null &&
          linesBySeries.map(({ id, points, color }) => {
            const p = nearestPoint(points);
            if (!p) return null;
            return (
              <circle key={id} cx={x(p.xFrac)} cy={y(p.pct)} r={3.5} fill={color} stroke="var(--bg-surface)" strokeWidth={1.5} className="chart-dot-pop" />
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
          className="chart-tooltip-pop"
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
          {linesBySeries.map(({ id, label, color, points }) => {
            const p = nearestPoint(points);
            return (
              <div key={id} style={{ padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                    {label}
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
