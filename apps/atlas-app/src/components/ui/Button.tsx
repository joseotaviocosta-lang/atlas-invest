import React from 'react';
import { colors, borderRadius } from '@atlas/ui';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}) => {
  const getBackgroundColor = () => {
    if (disabled || isLoading) return colors.surfaceElevated;
    switch (variant) {
      case 'primary':
        return colors.accent;
      case 'secondary':
        return colors.surfaceElevated;
      case 'outline':
        return 'transparent';
      case 'danger':
        return colors.negative;
      default:
        return colors.accent;
    }
  };

  const getTextColor = () => {
    if (disabled || isLoading) return colors.textMuted;
    switch (variant) {
      case 'outline':
        return colors.textPrimary;
      default:
        return colors.textPrimary;
    }
  };

  const getBorder = () => {
    if (variant === 'outline') {
      return `1px solid ${colors.border}`;
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
        borderRadius: `${borderRadius.md}px`,
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
              border: `2px solid ${colors.border}`,
              borderRadius: '50%',
              borderTopColor: colors.textPrimary,
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
};
