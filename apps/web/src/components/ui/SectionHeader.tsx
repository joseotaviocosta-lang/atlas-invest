'use client';

import React from 'react';
import { colors, spacing } from '@atlas/ui';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${spacing.sm}px`,
        marginBottom: `${spacing.md}px`,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: 600,
            color: colors.textPrimary,
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: '0.8125rem',
              color: colors.textMuted,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
