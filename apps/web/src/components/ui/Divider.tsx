'use client';

import React from 'react';
import { colors, spacing } from '@atlas/ui';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacingLevel?: 'none' | 'sm' | 'md' | 'lg';
}

export function Divider({ orientation = 'horizontal', spacingLevel = 'md' }: DividerProps) {
  const marginPx =
    spacingLevel === 'none' ? 0 : spacingLevel === 'sm' ? spacing.sm : spacingLevel === 'lg' ? spacing.xl : spacing.base;

  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        style={{
          width: '1px',
          backgroundColor: colors.border,
          margin: `0 ${marginPx}px`,
          alignSelf: 'stretch',
        }}
      />
    );
  }

  return (
    <hr
      style={{
        border: 'none',
        height: '1px',
        backgroundColor: colors.border,
        margin: `${marginPx}px 0`,
        width: '100%',
      }}
    />
  );
}
