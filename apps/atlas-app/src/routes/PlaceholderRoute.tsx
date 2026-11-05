import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';

interface PlaceholderRouteProps {
  title: string;
  description: string;
  badge?: string;
}

export const PlaceholderRoute: React.FC<PlaceholderRouteProps> = ({
  title,
  description,
  badge = 'Em breve (APP-6+)',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
        textAlign: 'center',
        minHeight: '60vh',
      }}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.lg,
          padding: spacing.xxl,
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ marginBottom: spacing.md }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: colors.accent,
              backgroundColor: `${colors.accent}15`,
              borderRadius: borderRadius.full,
              border: `1px solid ${colors.accent}30`,
            }}
          >
            {badge}
          </span>
        </div>

        <h2
          style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: '22px',
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
};
