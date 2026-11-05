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
  return `${sign}${v.toFixed(2)}%`.replace('.', ',');
}

export const PerformanceSeriesChart: React.FC<{
  series: PerformanceSeriesCurrencyVM;
  height?: number;
}> = ({ series, height = 300 }) => {
  const width = 640;
  const padL = 60;
  const padR = 16;
  const padT = 16;
  const padB = 32;
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
        aria-label={`Evolução da performance da carteira em ${series.currency}`}
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
              x={padL - 8}
              y={geometry.yAt(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill={colors.textSecondary}
              fontFamily="Inter, system-ui, sans-serif"
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
            strokeWidth={1.8}
            strokeDasharray="4 3"
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
      </svg>
      {/* Chart Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          marginTop: '12px',
          fontSize: '0.8125rem',
          color: colors.textSecondary,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '16px', height: '3px', backgroundColor: colors.accent, borderRadius: '2px' }} />
          <span>Carteira ({series.currency})</span>
        </div>
        {series.benchmarkName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '16px',
                height: '0px',
                borderTop: `2px dashed ${colors.textSecondary}`,
              }}
            />
            <span>Benchmark ({series.benchmarkName})</span>
          </div>
        )}
      </div>
    </div>
  );
};
