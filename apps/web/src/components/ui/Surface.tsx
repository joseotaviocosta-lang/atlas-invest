'use client';

import React from 'react';
import { colors, borderRadius, spacing, shadows } from '@atlas/ui';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: 'base' | 'elevated' | 'sunken';
  bordered?: boolean;
}

export function Surface({
  level = 'base',
  bordered = true,
  children,
  style,
  ...props
}: SurfaceProps) {
  const getBg = () => {
    switch (level) {
      case 'elevated':
        return colors.surfaceElevated;
      case 'sunken':
        return '#0E121A';
      case 'base':
      default:
        return colors.surface;
    }
  };

  const getShadow = () => {
    switch (level) {
      case 'elevated':
        return shadows.md;
      default:
        return shadows.none;
    }
  };

  return (
    <div
      style={{
        backgroundColor: getBg(),
        border: bordered ? `1px solid ${colors.border}` : 'none',
        borderRadius: `${borderRadius.lg}px`,
        boxShadow: getShadow(),
        padding: `${spacing.base}px`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
