'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Erro ao carregar dados',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        border: `1px solid rgba(239, 68, 68, 0.25)`,
        borderRadius: `${themeTokens.borderRadius.lg}px`,
      }}
    >
      <h3
        style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: themeTokens.colors.danger,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: '0 0 1.25rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
          maxWidth: '420px',
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
