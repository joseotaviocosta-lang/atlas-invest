'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface AssetPositionHeaderProps {
  ticker: string;
  name: string;
  assetClassLabel: string | null;
  portfolioId: string;
  portfolioName: string;
  isCostBasisIncomplete: boolean;
  completenessBadgeLabel: string | null;
}

export function AssetPositionHeader({
  ticker,
  name,
  assetClassLabel,
  portfolioId,
  portfolioName,
  isCostBasisIncomplete,
  completenessBadgeLabel,
}: AssetPositionHeaderProps) {
  return (
    <div style={{ marginBottom: `${spacing.xl}px` }}>
      {/* Breadcrumbs navigation */}
      <nav aria-label="Navegação estrutural" style={{ marginBottom: `${spacing.sm}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
          <Link
            href={`/portfolio${portfolioId ? `?portfolioId=${portfolioId}` : ''}`}
            style={{
              color: colors.accent,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            ← Carteira
          </Link>
          <span style={{ color: colors.textMuted }}>/</span>
          <span style={{ color: colors.textSecondary }}>{portfolioName}</span>
          <span style={{ color: colors.textMuted }}>/</span>
          <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{ticker}</span>
        </div>
      </nav>

      {/* Main Asset Title & Badges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: colors.textPrimary,
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              {ticker}
            </h1>
            {assetClassLabel && <Badge variant="neutral">{assetClassLabel}</Badge>}
            {isCostBasisIncomplete && completenessBadgeLabel && (
              <Badge variant="warning">{completenessBadgeLabel}</Badge>
            )}
          </div>
          {name !== ticker && (
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '1rem',
                color: colors.textSecondary,
              }}
            >
              {name}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
            Carteira
          </span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textSecondary }}>
            {portfolioName}
          </span>
        </div>
      </div>
    </div>
  );
}
