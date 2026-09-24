'use client';

import React, { useMemo } from 'react';
import { colors } from '@atlas/ui';
import type { RollingMetric, RollingSeriesVM } from '@atlas/ui';

/**
 * Parses a canonical decimal string into a number SOLELY for pixel mapping
 * (ADR-126/ADR-148). Visual geometry only: no rolling value is computed,
 * sliced, annualized or aggregated here.
 */
function decimalStringToPixels(value: string): number {
  const neg = value.startsWith('-');
  const abs = neg ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const frac = (fracPart + '000000').slice(0, 6);
  const scaled = Number(intPart || '0') * 1e6 + Number(frac || '0');
  return neg ? -scaled : scaled;
}

function formatTick(scaledMillionths: number, metric: RollingMetric): string {
  const v = scaledMillionths / 1e6;
  const text = v.toFixed(2).replace('.', ',');
  return metric === 'VOLATILITY' ? `${text}%` : text;
}

export function RollingRiskChart({
  series,
  metric,
  currency,
  height = 300,
}: {
  series: RollingSeriesVM;
  metric: RollingMetric;
  currency: string;
  height?: number;
}) {
  const width = 640;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const geometry = useMemo(() => {
    const scaled = series.points.map((p) =>
      p.valueRaw === null ? null : decimalStringToPixels(p.valueRaw),
    );
    const valued = scaled.filter((v): v is number => v !== null);
    if (valued.length === 0) return null;
    let min = Math.min(...valued, 0);
    let max = Math.max(...valued, 0);
    if (min === max) {
      min -= 1e6;
      max += 1e6;
    }
    const span = max - min;
    const n = series.points.length;
    const xAt = (i: number): number =>
      n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
    const yAt = (v: number): number => padT + (1 - (v - min) / span) * innerH;
    const pts = series.points.map((p, i) =>
      scaled[i] === null ? null : { x: xAt(i), y: yAt(scaled[i]!), tooltip: p.tooltip },
    );
    return { pts, zeroY: yAt(0), min, max, yAt };
  }, [series, innerW, innerH, padL, padT]);

  if (!geometry) return null;

  const segments: string[] = [];
  let current: string[] = [];
  for (const pt of geometry.pts) {
    if (!pt) {
      if (current.length > 1) segments.push(`M${current.join('L')}`);
      current = [];
    } else {
      current.push(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
    }
  }
  if (current.length > 1) segments.push(`M${current.join('L')}`);
  else if (current.length === 1) segments.push(`M${current[0]}`);

  const ticks = [geometry.max, 0, geometry.min];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Evolução do risco (${metric}) em ${currency} no período`}
        data-testid={`rolling-chart-${currency}`}
        style={{ display: 'block' }}
      >
        {ticks.map((t) => (
          <g key={String(t)}>
            <line
              x1={padL}
              x2={width - padR}
              y1={geometry.yAt(t)}
              y2={geometry.yAt(t)}
              stroke={t === 0 ? colors.textSecondary : colors.border}
              strokeWidth={t === 0 ? 1.5 : 1}
              strokeDasharray={t === 0 ? '6 3' : undefined}
            />
            <text
              x={padL - 6}
              y={geometry.yAt(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill={colors.textSecondary}
            >
              {formatTick(t, metric)}
            </text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path
            key={`l-${i}`}
            d={d}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2}
            data-testid="rolling-line"
          />
        ))}
        {geometry.pts.map((pt, i) =>
          pt ? (
            <circle key={i} cx={pt.x} cy={pt.y} r={8} fill="transparent">
              <title>{pt.tooltip}</title>
            </circle>
          ) : null,
        )}
        <text x={padL} y={height - 8} fontSize={11} fill={colors.textSecondary}>
          {series.points[0]?.dateDisplay ?? ''}
        </text>
        <text
          x={width - padR}
          y={height - 8}
          textAnchor="end"
          fontSize={11}
          fill={colors.textSecondary}
        >
          {series.points[series.points.length - 1]?.dateDisplay ?? ''}
        </text>
      </svg>
      <ul
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
        aria-label="Dados da série móvel"
      >
        {series.points.map((p) => (
          <li key={p.date}>{p.tooltip}</li>
        ))}
      </ul>
    </div>
  );
}
