'use client';

import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { BaseStatCardProps } from '@atlas/ui';

export function StatCard({
  label,
  value,
  subValue,
  changeType = 'neutral',
  isPlaceholder = false,
}: BaseStatCardProps) {
  const displayValue = isPlaceholder || !value ? '—' : value;
  const displaySubValue = isPlaceholder && !subValue ? 'Disponível após primeiras operações' : subValue;

  const getChangeColor = () => {
    if (isPlaceholder) return colors.textMuted;
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
          color: isPlaceholder ? colors.textMuted : colors.textPrimary,
          letterSpacing: '-0.3px',
        }}
      >
        {displayValue}
      </span>
      {displaySubValue && (
        <span
          style={{
            fontSize: '0.75rem',
            color: getChangeColor(),
            fontWeight: 500,
          }}
        >
          {displaySubValue}
        </span>
      )}
    </div>
  );
}
