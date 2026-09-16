'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = themeTokens.borderRadius.md,
  style,
}: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: `${borderRadius}px`,
        backgroundColor: '#1E2533',
        animation: 'pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
