'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const getBackgroundColor = () => {
    if (disabled || isLoading) return '#1F2937';
    switch (variant) {
      case 'primary':
        return themeTokens.colors.primary;
      case 'secondary':
        return '#1F2937';
      case 'outline':
        return 'transparent';
      case 'danger':
        return themeTokens.colors.danger;
      default:
        return themeTokens.colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled || isLoading) return '#9CA3AF';
    switch (variant) {
      case 'outline':
        return themeTokens.colors.text;
      default:
        return '#FFFFFF';
    }
  };

  const getBorder = () => {
    if (variant === 'outline') {
      return `1px solid ${themeTokens.colors.border}`;
    }
    return 'none';
  };

  const getPadding = () => {
    switch (size) {
      case 'sm':
        return '0.375rem 0.75rem';
      case 'lg':
        return '0.75rem 1.5rem';
      case 'md':
      default:
        return '0.625rem 1.25rem';
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return '0.8125rem';
      case 'lg':
        return '1rem';
      case 'md':
      default:
        return '0.875rem';
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: getPadding(),
        borderRadius: `${themeTokens.borderRadius.md}px`,
        fontSize: getFontSize(),
        fontWeight: 600,
        backgroundColor: getBackgroundColor(),
        color: getTextColor(),
        border: getBorder(),
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : 'auto',
        transition: 'background-color 0.15s ease, opacity 0.15s ease',
        outline: 'none',
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '50%',
              borderTopColor: '#FFFFFF',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          <span>Carregando...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
