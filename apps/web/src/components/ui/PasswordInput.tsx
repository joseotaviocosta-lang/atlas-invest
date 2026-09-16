'use client';

import React, { useState } from 'react';
import { colors, borderRadius } from '@atlas/ui';
import { InputProps } from './Input';

export function PasswordInput({ label, error, fullWidth = true, style, id, ...props }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
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
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          style={{
            padding: '0.625rem 2.5rem 0.625rem 0.875rem',
            fontSize: '0.875rem',
            backgroundColor: '#11161F',
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
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
          style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '0.375rem 0.5rem',
            borderRadius: `${borderRadius.sm}px`,
          }}
        >
          {showPassword ? 'Ocultar' : 'Exibir'}
        </button>
      </div>
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
