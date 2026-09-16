'use client';

import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function ListRow({ title, subtitle, leading, trailing, onClick, style }: ListRowProps) {
  const isClickable = Boolean(onClick);

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${spacing.base}px`,
        padding: `${spacing.md}px ${spacing.base}px`,
        borderRadius: `${borderRadius.md}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px`, minWidth: 0 }}>
        {leading}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: colors.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: '0.75rem',
                color: colors.textSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '2px',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
}
