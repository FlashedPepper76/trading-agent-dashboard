"use client";

import { useMemo, useState } from "react";
import type { AlignedPoint } from "./compare-helpers";
import { fmtPct, fmtShortDate } from "./compare-helpers";
import { AGENTS } from "../../lib/agents";

export function DualReturnChart({
  series,
  agentIds,
  colors,
}: {
  series: AlignedPoint[];
  agentIds: string[];
  colors: Record<string, string>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length < 2) {
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

  const allValues = series.flatMap((p) => agentIds.map((id) => p.pctByAgent[id])).filter(
    (v): v is number => v != null
  );
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(0, ...allValues);
  // pad the domain a bit so lines/extremes aren't flush against the edges
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const x = (i: number) => padLeft + (i / (series.length - 1)) * plotW;
  const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;
  const zeroY = y(0);

  const linesByAgent = agentIds.map((id) => {
    const points = series
      .map((p, i) => {
        const v = p.pctByAgent[id];
        return v == null ? null : { i, x: x(i), y: y(v), v };
      })
      .filter((p): p is { i: number; x: number; y: number; v: number } => p !== null);
    return { id, points, polyline: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
  });

  // y-axis gridlines: 5 evenly spaced ticks across the padded domain
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => min + (range * i) / (yTickCount - 1));

  // x-axis: aim for ~6 labels regardless of series length
  const xTickCount = Math.min(6, series.length);
  const xTickIdx = Array.from(new Set(
    Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * (series.length - 1)))
  ));

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.round(((relX - padLeft) / plotW) * (series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  }

  const hovered = hoverIdx != null ? series[hoverIdx] : null;

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
              stroke={Math.abs(v) < 1e-9 ? "var(--border-hairline)" : "var(--border-hairline)"}
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

        {hoverIdx != null && (
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}

        {hoverIdx != null &&
          linesByAgent.map(({ id, points }) => {
            const p = points.find((pt) => pt.i === hoverIdx);
            if (!p) return null;
            return (
              <circle key={id} cx={p.x} cy={p.y} r={3.5} fill={colors[id]} stroke="var(--bg-surface)" strokeWidth={1.5} />
            );
          })}

        {xTickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={h - 6}
            fontSize={10}
            fontFamily="var(--font-mono)"
            fill="var(--text-faint)"
            textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
          >
            {fmtShortDate(series[i].date)}
          </text>
        ))}

        {/* transparent capture layer for hover/touch, on top so it always receives events */}
        <rect
          x={padLeft}
          y={padTop}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        />
      </svg>

      {hovered ? (
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
            minWidth: 130,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ color: "var(--text-faint)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
            {fmtShortDate(hovered.date)}
          </div>
          {agentIds.map((id) => {
            const v = hovered.pctByAgent[id];
            return (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[id], display: "inline-block" }} />
                  {AGENTS[id as keyof typeof AGENTS]?.label ?? id}
                </span>
                <span style={{ fontWeight: 600, color: v == null ? "var(--text-faint)" : v >= 0 ? "var(--accent-buy)" : "var(--accent-sell)" }}>
                  {fmtPct(v)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
