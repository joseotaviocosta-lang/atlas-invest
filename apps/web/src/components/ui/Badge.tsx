'use client';

import React from 'react';
import { colors, borderRadius } from '@atlas/ui';

export interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | 'primary'
    | 'positive'
    | 'success'
    | 'warning'
    | 'negative'
    | 'danger'
    | 'neutral'
    | 'default'
    | 'info';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'neutral', style }: BadgeProps) {
  const getStyles = () => {
    switch (variant) {
      case 'primary':
        return { bg: colors.accentSubtle, color: colors.accent };
      case 'positive':
      case 'success':
        return { bg: colors.positiveSubtle, color: colors.positive };
      case 'warning':
        return { bg: colors.warningSubtle, color: colors.warning };
      case 'negative':
      case 'danger':
        return { bg: colors.negativeSubtle, color: colors.negative };
      case 'info':
        return { bg: colors.infoSubtle, color: colors.info };
      case 'neutral':
      case 'default':
      default:
        return { bg: colors.surfaceElevated, color: colors.textSecondary };
    }
  };

  const { bg, color } = getStyles();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.6rem',
        borderRadius: `${borderRadius.pill}px`,
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: bg,
        color,
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
