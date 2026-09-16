'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        backgroundColor: themeTokens.colors.surface,
        border: `1px dashed ${themeTokens.colors.border}`,
        borderRadius: `${themeTokens.borderRadius.lg}px`,
      }}
    >
      {icon && (
        <div style={{ marginBottom: '1rem', color: themeTokens.colors.textMuted }}>{icon}</div>
      )}
      <h3
        style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: themeTokens.colors.text,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
          maxWidth: '400px',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
