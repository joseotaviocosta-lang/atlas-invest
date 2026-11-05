import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';

export interface OfflineBannerProps {
  isOffline: boolean;
  lastSyncFormatted?: string | null;
  message?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOffline,
  lastSyncFormatted,
  message,
}) => {
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      style={{
        backgroundColor: `${colors.warning}15`,
        border: `1px solid ${colors.warning}40`,
        borderRadius: `${borderRadius.md}px`,
        padding: `${spacing.sm}px ${spacing.base}px`,
        marginBottom: `${spacing.base}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: colors.warning,
        fontSize: '0.8125rem',
        fontWeight: 500,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span aria-hidden="true">📡</span>
        <span>{message || 'Modo Offline — exibindo dados em cache'}</span>
      </div>
      {lastSyncFormatted && (
        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
          Última sincronização: {lastSyncFormatted}
        </span>
      )}
    </div>
  );
};
