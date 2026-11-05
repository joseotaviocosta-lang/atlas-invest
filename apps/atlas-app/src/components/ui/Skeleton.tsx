import React from 'react';
import { colors, borderRadius as radiusTokens } from '@atlas/ui';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius = radiusTokens.md,
  style,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: `${borderRadius}px`,
        backgroundColor: colors.surfaceElevated,
        opacity: 0.6,
        ...style,
      }}
    />
  );
};
