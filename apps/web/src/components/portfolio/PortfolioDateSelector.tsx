'use client';

import React from 'react';
import { colors } from '@atlas/ui';
import { Input } from '@/components/ui';

export interface PortfolioDateSelectorProps {
  /** Selected civil date `YYYY-MM-DD`, or `null` for current mode. */
  value: string | null;
  /** Local civil today `YYYY-MM-DD` (upper bound; future dates refused). */
  today: string;
  /** Validation message, rendered associated to the input. */
  error?: string | null;
  /** Emits the raw `YYYY-MM-DD` value, or `null` when cleared. */
  onChange: (value: string | null) => void;
}

/**
 * Historical date selector (Fase 2F).
 *
 * Native `<input type="date">` yields an ISO civil string directly, so no
 * timezone conversion ever touches the economic date. The parent resolves the
 * temporal context (today normalization, future/invalid rejection) and owns
 * URL state; this component only collects and labels the input.
 */
export function PortfolioDateSelector({
  value,
  today,
  error,
  onChange,
}: PortfolioDateSelectorProps) {
  const errorId = 'portfolio-date-error';
  return (
    <div>
      <Input
        id="portfolio-date"
        label="Data da carteira"
        type="date"
        value={value ?? today}
        max={today}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        aria-describedby={error ? errorId : 'portfolio-date-hint'}
        fullWidth={false}
      />
      <p
        id="portfolio-date-hint"
        style={{ fontSize: '0.75rem', color: colors.textMuted, margin: '-0.5rem 0 1rem 0' }}
      >
        Deixe em hoje para ver a carteira atual.
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          style={{ fontSize: '0.8125rem', color: colors.negative, margin: '0 0 1rem 0' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
