'use client';

import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({
  'aria-label': ariaLabel,
  icon,
  variant = 'ghost',
  size = 'md',
  disabled,
  style,
  ...props
}: IconButtonProps) {
  const sizePx = size === 'sm' ? 36 : size === 'lg' ? 48 : 44;

  const getBackgroundColor = () => {
    if (disabled) return 'transparent';
    switch (variant) {
      case 'primary':
        return colors.accent;
      case 'secondary':
        return colors.surfaceElevated;
      case 'danger':
        return colors.negative;
      case 'ghost':
      default:
        return 'transparent';
    }
  };

  const getColor = () => {
    if (disabled) return colors.disabledText;
    switch (variant) {
      case 'primary':
      case 'danger':
        return '#FFFFFF';
      case 'secondary':
      case 'ghost':
      default:
        return colors.textPrimary;
    }
  };

  const getBorder = () => {
    if (variant === 'secondary') {
      return `1px solid ${colors.border}`;
    }
    return 'none';
  };

  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        minWidth: '44px',
        minHeight: '44px',
        borderRadius: `${borderRadius.md}px`,
        backgroundColor: getBackgroundColor(),
        color: getColor(),
        border: getBorder(),
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: `${spacing.xs}px`,
        transition: 'background-color 0.15s ease, opacity 0.15s ease',
        outline: 'none',
        ...style,
      }}
      {...props}
    >
      {icon}
    </button>
  );
}
