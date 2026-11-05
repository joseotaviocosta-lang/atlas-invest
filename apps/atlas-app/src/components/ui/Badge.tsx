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

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', style }) => {
  const getStyles = () => {
    switch (variant) {
      case 'primary':
        return { bg: colors.accentSubtle, color: colors.accent, border: `${colors.accent}40` };
      case 'positive':
      case 'success':
        return { bg: colors.positiveSubtle, color: colors.positive, border: `${colors.positive}40` };
      case 'warning':
        return { bg: colors.warningSubtle, color: colors.warning, border: `${colors.warning}40` };
      case 'negative':
      case 'danger':
        return { bg: colors.negativeSubtle, color: colors.negative, border: `${colors.negative}40` };
      case 'info':
        return { bg: colors.infoSubtle, color: colors.info, border: `${colors.info}40` };
      case 'neutral':
      case 'default':
      default:
        return { bg: colors.surfaceElevated, color: colors.textSecondary, border: colors.border };
    }
  };

  const { bg, color, border } = getStyles();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0.2rem 0.6rem',
        borderRadius: `${borderRadius.full}px`,
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
};
