import React from 'react';
import { colors, borderRadius } from '@atlas/ui';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        backgroundColor: colors.surface,
        border: `1px dashed ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
      }}
    >
      {icon && (
        <div style={{ marginBottom: '1rem', color: colors.textSecondary }}>{icon}</div>
      )}
      <h3
        style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: colors.textPrimary,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: colors.textSecondary,
          maxWidth: '420px',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
