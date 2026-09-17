'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';

export interface PortfolioCompletenessBannerProps {
  message?: string | null;
}

export function PortfolioCompletenessBanner({
  message = 'Algumas posições possuem custo de aquisição incompleto. Os valores de custo e preço médio dessas posições não podem ser exibidos com precisão.',
}: PortfolioCompletenessBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: colors.warningSubtle,
        border: `1px solid ${colors.warning}`,
        borderRadius: `${borderRadius.md}px`,
        padding: `${spacing.md}px ${spacing.base}px`,
        marginBottom: `${spacing.base}px`,
        display: 'flex',
        alignItems: 'center',
        gap: `${spacing.sm}px`,
      }}
    >
      <span
        style={{
          color: colors.warning,
          fontSize: '1rem',
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        ℹ
      </span>
      <span
        style={{
          color: colors.textPrimary,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
        }}
      >
        {message}
      </span>
    </div>
  );
}
