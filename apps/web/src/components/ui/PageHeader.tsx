'use client';

import React from 'react';
import { colors, spacing } from '@atlas/ui';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumb, action }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: `${spacing.base}px`,
        marginBottom: `${spacing.xl}px`,
        flexWrap: 'wrap',
      }}
    >
      <div>
        {breadcrumb && (
          <span
            style={{
              fontSize: '0.75rem',
              color: colors.textMuted,
              marginBottom: '4px',
              display: 'block',
            }}
          >
            {breadcrumb}
          </span>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: '-0.3px',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '0.875rem',
              color: colors.textSecondary,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          {action}
        </div>
      )}
    </div>
  );
}
