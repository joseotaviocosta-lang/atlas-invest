'use client';

import React from 'react';
import { colors, borderRadius } from '@atlas/ui';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Input({ label, error, fullWidth = true, style, id, ...props }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        width: fullWidth ? '100%' : 'auto',
        marginBottom: '1rem',
      }}
    >
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          padding: '0.625rem 0.875rem',
          fontSize: '0.875rem',
          backgroundColor: colors.surfaceElevated,
          color: colors.textPrimary,
          border: `1px solid ${error ? colors.negative : colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          outline: 'none',
          boxSizing: 'border-box',
          width: '100%',
          transition: 'border-color 0.15s ease',
          ...style,
        }}
        {...props}
      />
      {error && (
        <span
          style={{
            fontSize: '0.75rem',
            color: colors.negative,
            marginTop: '0.125rem',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
