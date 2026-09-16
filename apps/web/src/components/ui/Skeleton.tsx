'use client';

import React from 'react';
import { colors, borderRadius as radiusTokens } from '@atlas/ui';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = radiusTokens.md,
  style,
}: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: `${borderRadius}px`,
        backgroundColor: colors.surfaceElevated,
        animation: 'pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
