import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { colors } from '@atlas/ui';
import type { RollingMetric, RollingSeriesVM } from '@atlas/ui';

/**
 * Parses a canonical decimal string into chart units SOLELY for pixel mapping
 * (ADR-126/ADR-148). Visual geometry only — no rolling value is computed here.
 */
function decimalStringToPixels(value: string): number {
  const neg = value.startsWith('-');
  const abs = neg ? value.slice(1) : value;
  const parts = abs.split('.');
  const intPart = parts[0] || '0';
  const fracPart = ((parts[1] || '') + '000000').slice(0, 6);
  const scaled = Number(intPart) * 1e6 + Number(fracPart);
  return neg ? -scaled : scaled;
}

const CHART_W = 320;
const CHART_H = 200;
const PAD_L = 52;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 24;

export function MobileRollingRiskChart({
  series,
  metric,
  currency,
}: {
  series: RollingSeriesVM;
  metric: RollingMetric;
  currency: string;
}) {
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
    const innerW = CHART_W - PAD_L - PAD_R;
    const innerH = CHART_H - PAD_T - PAD_B;
    const n = series.points.length;
    const xAt = (i: number): number =>
      n === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW;
    const yAt = (v: number): number => PAD_T + (1 - (v - min) / span) * innerH;
    const pts = series.points.map((_p, i) =>
      scaled[i] === null ? null : { x: xAt(i), y: yAt(scaled[i]!) },
    );
    return { pts, zeroY: yAt(0), min, max, yAt };
  }, [series]);

  if (!geometry) return null;

  const renderSegments = (): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < geometry.pts.length - 1; i++) {
      const a = geometry.pts[i];
      const b = geometry.pts[i + 1];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      nodes.push(
        <View
          key={`seg-${i}`}
          testID={i === 0 ? 'rolling-line' : undefined}
          style={{
            position: 'absolute',
            left: a.x,
            top: a.y - 1,
            width: len,
            height: 2,
            backgroundColor: colors.accent,
            transform: [{ rotate: `${angle}deg` }],
          }}
        />,
      );
    }
    return nodes;
  };

  const last = series.points[series.points.length - 1];

  return (
    <View
      accessibilityLabel={`Evolução do risco (${metric}) em ${currency} no período`}
      accessibilityRole="image"
      testID={`rolling-chart-${currency}`}
    >
      <View style={{ width: CHART_W, height: CHART_H, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            left: PAD_L,
            right: PAD_R,
            top: geometry.zeroY - 0.5,
            height: 1,
            backgroundColor: colors.textSecondary,
          }}
        />
        {renderSegments()}
        {geometry.pts.map((pt, i) =>
          pt ? (
            <View
              key={`dot-${i}`}
              style={{
                position: 'absolute',
                left: pt.x - 2,
                top: pt.y - 2,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.accent,
              }}
            />
          ) : null,
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {series.points[0]?.dateDisplay ?? ''}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {series.points[series.points.length - 1]?.dateDisplay ?? ''}
        </Text>
      </View>
      {last ? (
        <Text
          style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}
          accessibilityLabel={last.tooltip}
        >
          {last.tooltip}
        </Text>
      ) : null}
    </View>
  );
}
