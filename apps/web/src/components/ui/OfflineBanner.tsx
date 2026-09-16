'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';
import { useNetworkStatus } from '@/providers/auth-provider';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        border: `1px solid ${themeTokens.colors.warning}`,
        color: themeTokens.colors.warning,
        padding: '0.625rem 1rem',
        borderRadius: `${themeTokens.borderRadius.md}px`,
        fontSize: '0.875rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}
    >
      <span style={{ fontSize: '1rem' }}>⚠️</span>
      <span>Você está desconectado. Algumas funcionalidades podem estar indisponíveis.</span>
    </div>
  );
}
