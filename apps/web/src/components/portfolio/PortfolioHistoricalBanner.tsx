'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface PortfolioHistoricalBannerProps {
  /** e.g. `Visualizando carteira em 15/03/2026`. */
  label: string;
  onBackToToday: () => void;
}

/**
 * Persistent historical-mode banner (Fase 2F).
 *
 * Always visible while `asOf` is active so the user never mistakes a
 * reconstructed snapshot for current data. Informational tone (no alarm).
 */
export function PortfolioHistoricalBanner({
  label,
  onBackToToday,
}: PortfolioHistoricalBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${spacing.sm}px`,
        flexWrap: 'wrap',
        padding: `${spacing.sm}px ${spacing.base}px`,
        marginBottom: `${spacing.base}px`,
        backgroundColor: colors.accentSubtle,
        border: `1px solid ${colors.accent}`,
        borderRadius: `${borderRadius.md}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
        <Badge variant="primary">Histórico</Badge>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
          {label}
        </span>
      </div>
      <button
        type="button"
        onClick={onBackToToday}
        style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: colors.accent,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 4px',
          minHeight: '44px',
        }}
      >
        Voltar para hoje
      </button>
    </div>
  );
}
