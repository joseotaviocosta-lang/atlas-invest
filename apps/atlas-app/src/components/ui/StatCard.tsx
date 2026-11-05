import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';

export interface StatCardProps {
  label: string;
  value?: string | null;
  subValue?: string | null;
  changeType?: 'positive' | 'negative' | 'neutral';
  isPlaceholder?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  changeType = 'neutral',
  isPlaceholder = false,
}) => {
  const displayValue = isPlaceholder || !value ? '—' : value;
  const displaySubValue =
    isPlaceholder && !subValue ? 'Disponível após primeiras operações' : subValue;

  const getChangeColor = () => {
    if (isPlaceholder) return colors.textSecondary;
    switch (changeType) {
      case 'positive':
        return colors.positive;
      case 'negative':
        return colors.negative;
      case 'neutral':
      default:
        return colors.textSecondary;
    }
  };

  return (
    <div
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
        padding: `${spacing.base}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1,
        minWidth: '180px',
      }}
    >
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: colors.textSecondary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: colors.textPrimary,
          letterSpacing: '-0.02em',
        }}
      >
        {displayValue}
      </span>
      {displaySubValue && (
        <span
          style={{
            fontSize: '0.75rem',
            color: getChangeColor(),
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {displaySubValue}
        </span>
      )}
    </div>
  );
};
