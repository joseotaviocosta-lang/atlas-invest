'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

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
            color: themeTokens.colors.textMuted,
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
          backgroundColor: '#11161F',
          color: themeTokens.colors.text,
          border: `1px solid ${error ? themeTokens.colors.danger : themeTokens.colors.border}`,
          borderRadius: `${themeTokens.borderRadius.md}px`,
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
            color: themeTokens.colors.danger,
            marginTop: '0.125rem',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
