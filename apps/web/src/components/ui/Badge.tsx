'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'neutral';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'neutral', style }: BadgeProps) {
  const getStyles = () => {
    switch (variant) {
      case 'primary':
        return { bg: 'rgba(10, 132, 255, 0.15)', color: themeTokens.colors.primary };
      case 'success':
        return { bg: 'rgba(16, 185, 129, 0.15)', color: themeTokens.colors.success };
      case 'warning':
        return { bg: 'rgba(245, 158, 11, 0.15)', color: themeTokens.colors.warning };
      case 'neutral':
      default:
        return { bg: '#1F2937', color: themeTokens.colors.textMuted };
    }
  };

  const { bg, color } = getStyles();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.6rem',
        borderRadius: `${themeTokens.borderRadius.full}px`,
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
