import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';

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

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  fullWidth = true,
  style,
  id,
  disabled,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.xs}px`,
        width: fullWidth ? '100%' : 'auto',
        marginBottom: `${spacing.sm}px`,
      }}
    >
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        disabled={disabled}
        style={{
          padding: '0.625rem 0.875rem',
          fontSize: '0.875rem',
          backgroundColor: colors.surfaceElevated,
          color: colors.textPrimary,
          border: `1px solid ${error ? colors.negative : colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          fontFamily: 'inherit',
          ...style,
        }}
        {...props}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            }}
          >
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span
          role="alert"
          style={{
            fontSize: '0.75rem',
            color: colors.negative,
            marginTop: '2px',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
};
