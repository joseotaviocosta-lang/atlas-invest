'use client';

import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { StatusVariant } from '@atlas/ui';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  selected?: boolean;
  variant?: StatusVariant;
  icon?: React.ReactNode;
}

export function Chip({
  label,
  selected = false,
  variant = 'default',
  icon,
  style,
  disabled,
  ...props
}: ChipProps) {
  const getBackgroundColor = () => {
    if (disabled) return colors.surfaceElevated;
    if (selected) return colors.accent;
    switch (variant) {
      case 'positive':
        return colors.positiveSubtle;
      case 'negative':
        return colors.negativeSubtle;
      case 'warning':
        return colors.warningSubtle;
      case 'info':
        return colors.infoSubtle;
      case 'default':
      default:
        return colors.surfaceElevated;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.disabledText;
    if (selected) return '#FFFFFF';
    switch (variant) {
      case 'positive':
        return colors.positive;
      case 'negative':
        return colors.negative;
      case 'warning':
        return colors.warning;
      case 'info':
        return colors.info;
      case 'default':
      default:
        return colors.textPrimary;
    }
  };

  const getBorderColor = () => {
    if (selected) return colors.accent;
    return colors.border;
  };

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: `${spacing.xs}px ${spacing.md}px`,
        borderRadius: `${borderRadius.pill}px`,
        fontSize: '0.8125rem',
        fontWeight: selected ? 600 : 500,
        backgroundColor: getBackgroundColor(),
        color: getTextColor(),
        border: `1px solid ${getBorderColor()}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        outline: 'none',
        ...style,
      }}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
