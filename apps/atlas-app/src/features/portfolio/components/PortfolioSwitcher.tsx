import React from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { colors, borderRadius, spacing } from '@atlas/ui';

export const PortfolioSwitcher: React.FC = () => {
  const { portfolios, selectedPortfolioId, setSelectedPortfolioId, isLoadingPortfolios } =
    usePortfolio();

  if (isLoadingPortfolios) {
    return (
      <div
        style={{
          height: '36px',
          width: '180px',
          backgroundColor: colors.surfaceElevated,
          borderRadius: `${borderRadius.md}px`,
          opacity: 0.6,
        }}
      />
    );
  }

  if (portfolios.length <= 1) {
    const single = portfolios[0];
    if (!single) return null;
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          fontSize: '0.875rem',
          fontWeight: 600,
          color: colors.textPrimary,
        }}
      >
        <span aria-hidden="true">💼</span>
        <span>{single.name}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={selectedPortfolioId ?? ''}
        onChange={(e) => setSelectedPortfolioId(e.target.value)}
        aria-label="Selecionar Carteira"
        data-testid="portfolio-switcher-select"
        style={{
          appearance: 'none',
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          color: colors.textPrimary,
          fontSize: '0.875rem',
          fontWeight: 600,
          padding: `6px ${spacing.xl}px 6px ${spacing.md}px`,
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 0.15s ease',
        }}
      >
        {portfolios.map((p) => (
          <option key={p.id} value={p.id} style={{ backgroundColor: colors.surface, color: colors.textPrimary }}>
            {p.name}
          </option>
        ))}
      </select>
      <div
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          fontSize: '0.6875rem',
          color: colors.textSecondary,
        }}
      >
        ▼
      </div>
    </div>
  );
};
