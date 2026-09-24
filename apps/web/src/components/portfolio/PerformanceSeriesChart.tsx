'use client';

import React, { useMemo } from 'react';
import { colors } from '@atlas/ui';
import type { PerformanceSeriesCurrencyVM } from '@atlas/ui';

interface ChartGeometryPoint {
  x: number;
  y: number;
  label: string;
  portfolioFormatted: string;
  benchmarkFormatted: string;
  hasBenchmark: boolean;
}

/**
 * Parses a canonical decimal string (e.g. "-12.50", "0", "2.01") into a
 * number SOLELY for pixel mapping (ADR-126). This is visual geometry, not
 * financial math: no return is computed, normalized, chained or aggregated
 * here — values arrive server-computed as exact decimal strings.
 */
function decimalStringToPixels(value: string): number {
  const neg = value.startsWith('-');
  const abs = neg ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const frac = (fracPart + '000000').slice(0, 6);
  const scaled = Number(intPart || '0') * 1e6 + Number(frac || '0');
  return neg ? -scaled : scaled;
}

function formatAxisTick(scaledMillionths: number): string {
  const v = scaledMillionths / 1e6;
  const sign = v > 0 ? '+' : '';
  const text = `${sign}${v.toFixed(2)}%`.replace('.', ',');
  return text;
}

export function PerformanceSeriesChart({
  series,
  height = 320,
}: {
  series: PerformanceSeriesCurrencyVM;
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
    const valued = series.points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.portfolioReturn !== null);
    if (valued.length === 0) return null;
    const allScaled: number[] = [];
    for (const { p } of valued) {
      allScaled.push(decimalStringToPixels(p.portfolioReturn as string));
      if (p.benchmarkReturn !== null) {
        allScaled.push(decimalStringToPixels(p.benchmarkReturn));
      }
    }
    let min = Math.min(...allScaled, 0);
    let max = Math.max(...allScaled, 0);
    if (min === max) {
      min -= 1e6;
      max += 1e6;
    }
    const span = max - min;
    const n = series.points.length;
    const xAt = (i: number): number =>
      n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
    const yAt = (scaled: number): number => padT + (1 - (scaled - min) / span) * innerH;
    const zeroY = yAt(0);
    const pts: Array<ChartGeometryPoint | null> = series.points.map((p, i) => {
      if (p.portfolioReturn === null) return null;
      return {
        x: xAt(i),
        y: yAt(decimalStringToPixels(p.portfolioReturn)),
        label: p.dateDisplay,
        portfolioFormatted: p.portfolioReturnFormatted,
        benchmarkFormatted: p.benchmarkReturnFormatted,
        hasBenchmark: p.benchmarkReturn !== null,
      };
    });
    const benchPts: Array<{ x: number; y: number } | null> = series.points.map((p, i) => {
      if (p.benchmarkReturn === null) return null;
      return { x: xAt(i), y: yAt(decimalStringToPixels(p.benchmarkReturn)) };
    });
    return { pts, benchPts, zeroY, min, max, yAt };
  }, [series, innerW, innerH, padL, padT]);

  if (!geometry) return null;

  const toPath = (pts: Array<{ x: number; y: number } | null>): string[] => {
    const segments: string[] = [];
    let current: string[] = [];
    for (const pt of pts) {
      if (!pt) {
        if (current.length > 1) segments.push(`M${current.join('L')}`);
        current = [];
      } else {
        current.push(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
      }
    }
    if (current.length > 1) segments.push(`M${current.join('L')}`);
    else if (current.length === 1) segments.push(`M${current[0]}`);
    return segments;
  };

  const portfolioPaths = toPath(geometry.pts);
  const benchmarkPaths = toPath(geometry.benchPts);
  const ticks = [geometry.max, 0, geometry.min];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Evolução da performance da carteira em ${series.currency} no período`}
        data-testid={`performance-series-chart-${series.currency}`}
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
              {formatAxisTick(t)}
            </text>
          </g>
        ))}
        {benchmarkPaths.map((d, i) => (
          <path
            key={`b-${i}`}
            d={d}
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={2}
            strokeDasharray="5 3"
            data-testid="benchmark-line"
          />
        ))}
        {portfolioPaths.map((d, i) => (
          <path
            key={`p-${i}`}
            d={d}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
            data-testid="portfolio-line"
          />
        ))}
        {geometry.pts.map((pt, i) =>
          pt ? (
            <circle key={i} cx={pt.x} cy={pt.y} r={8} fill="transparent">
              <title>
                {pt.label} • Carteira: {pt.portfolioFormatted}
                {pt.hasBenchmark ? ` • Benchmark: ${pt.benchmarkFormatted}` : ''}
              </title>
            </circle>
          ) : null,
        )}
        {geometry.pts.map((pt, i) =>
          pt ? (
            <circle
              key={`dot-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={2.5}
              fill={colors.accent}
              pointerEvents="none"
            />
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
        aria-label="Dados da série de performance"
      >
        {series.points.map((p) => (
          <li key={p.date}>{p.tooltip}</li>
        ))}
      </ul>
    </div>
  );
}
