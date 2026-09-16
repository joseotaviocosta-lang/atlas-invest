'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  fullWidth?: boolean;
}

export function Select({
  label,
  options,
  error,
  fullWidth = true,
  style,
  id,
  ...props
}: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

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
          htmlFor={selectId}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: themeTokens.colors.textMuted,
          }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
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
          cursor: 'pointer',
          ...style,
        }}
        {...props}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: '#151A23', color: '#F3F4F6' }}
          >
            {opt.label}
          </option>
        ))}
      </select>
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
